import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { OrganizationsService } from './organizations.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const platformUser: AuthUser = {
  id: 'u-2',
  uuid: 'uu-2',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: { findUnique: jest.Mock; update: jest.Mock };
  };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('finds an organization by id', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });

    const result = await service.findById('org-1');

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
    expect(result).toEqual({ id: 'org-1' });
  });

  it('returns null when the organization does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing')).resolves.toBeNull();
  });

  describe('empresa (specs/024-configuraciones-v1 §2)', () => {
    it('reads the organization of the JWT, never one from the body', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Baterias del Caribe',
      });

      const result = await service.findMe(orgUser);

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
      });
      expect(result.name).toBe('Baterias del Caribe');
    });

    it('rejects a platform account without organization', async () => {
      await expect(service.findMe(platformUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it('updates only the editable fields and audits', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      await service.updateMe(orgUser, { name: 'Nuevo nombre', city: 'Cali' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Nuevo nombre', city: 'Cali' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'configuraciones',
          action: 'configuration.empresa.updated',
          organizationId: 'org-1',
        }),
      );
    });

    it('a partial patch does not reset the rest (AC-10)', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      await service.updateMe(orgUser, { phone: '6051234567' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { phone: '6051234567' },
      });
    });

    it('rejects a platform account without organization', async () => {
      await expect(
        service.updateMe(platformUser, { name: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });
});
