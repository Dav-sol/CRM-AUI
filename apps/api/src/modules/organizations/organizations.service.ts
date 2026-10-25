import { ForbiddenException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';

import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

// Módulo de auditoría: Configuraciones v1 (§8) agrupa las tres secciones
// (empresa, horarios, parámetros) bajo `configuraciones`.
const MODULE = 'configuraciones';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  /**
   * Empresa of the caller (specs/024-configuraciones-v1 §2). The organization
   * always comes from the JWT: a platform account has none and is rejected.
   */
  async findMe(user: AuthUser): Promise<Organization> {
    const organizationId = this.requireOrg(user);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new ForbiddenException({
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
    }
    return organization;
  }

  /**
   * Empresa update. `slug` and `status` are deliberately not editable here
   * (AC-10): the slug is the public identifier and the status is a platform
   * concern.
   */
  async updateMe(
    user: AuthUser,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const organizationId = this.requireOrg(user);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nit !== undefined ? { nit: dto.nit } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'configuration.empresa.updated',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `organization configuration empresa updated organization=${updated.uuid}`,
      metadata: { keys: Object.keys(dto) },
    });

    return updated;
  }

  private requireOrg(user: AuthUser): string {
    if (user.accountType === 'PLATFORM' || !user.organizationId) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'La organización requiere una cuenta de organización',
        },
      });
    }
    return user.organizationId;
  }
}
