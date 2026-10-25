import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { TenantScopeGuard } from '../../core/guards/tenant-scope.guard';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /**
   * Empresa (specs/024-configuraciones-v1 §2). Declared before `:id`, or the
   * generic route would capture "me". It only ever serves the caller's own
   * organization, taken from the JWT.
   */
  @Get('me')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR')
  async findMe(@CurrentUser() user: AuthUser) {
    return { data: await this.organizationsService.findMe(user) };
  }

  @Patch('me')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR')
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return { data: await this.organizationsService.updateMe(user, dto) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const organization = await this.organizationsService.findById(id);
    if (!organization) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
      });
    }
    return { data: organization };
  }
}
