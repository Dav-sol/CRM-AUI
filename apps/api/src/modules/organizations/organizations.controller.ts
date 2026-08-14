import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../core/guards/tenant-scope.guard';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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
