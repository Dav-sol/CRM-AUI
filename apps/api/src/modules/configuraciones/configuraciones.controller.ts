import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { TenantScopeGuard } from '../../core/guards/tenant-scope.guard';
import { ConfiguracionesService } from './configuraciones.service';
import {
  UpdateHorariosDto,
  UpdateParametrosDto,
} from './dto/update-configuraciones.dto';

/**
 * Configuración de la organización (specs/024-configuraciones-v1 §4):
 * lectura y escritura restringidas a ADMINISTRADOR y PLATFORM_OWNER, siempre
 * sobre la organización del JWT.
 */
@Controller('configuraciones')
@UseGuards(JwtAuthGuard, RolesGuard, TenantScopeGuard)
@Roles('PLATFORM_OWNER', 'ADMINISTRADOR')
export class ConfiguracionesController {
  constructor(private readonly service: ConfiguracionesService) {}

  @Get('horarios')
  async horarios(@CurrentUser() user: AuthUser) {
    return { data: await this.service.horarios(this.orgOf(user)) };
  }

  @Patch('horarios')
  async updateHorarios(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateHorariosDto,
  ) {
    return { data: await this.service.updateHorarios(user, dto) };
  }

  @Get('parametros')
  async parametros(@CurrentUser() user: AuthUser) {
    return { data: await this.service.parametros(this.orgOf(user)) };
  }

  @Patch('parametros')
  @HttpCode(HttpStatus.OK)
  async updateParametros(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateParametrosDto,
  ) {
    return { data: await this.service.updateParametros(user, dto) };
  }

  /** Every parameter with its origin: db | env | default. */
  @Get('efectivas')
  async efectivas(@CurrentUser() user: AuthUser) {
    return { data: await this.service.parametros(this.orgOf(user)) };
  }

  private orgOf(user: AuthUser): string {
    return this.service.requireOrganizationId(user);
  }
}
