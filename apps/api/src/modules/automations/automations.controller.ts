import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AutomationsService } from './automations.service';
import { AutomationPathParamsDto } from './dto/automation-path-params.dto';
import { QueryAutomationsDto } from './dto/query-automations.dto';
import { QueryCommercialCyclesDto } from './dto/query-commercial-cycles.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get('commercial-cycles')
  async listCycles(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCommercialCyclesDto,
  ) {
    return this.automationsService.listCycles(user, query);
  }

  @Get('commercial-cycles/:uuid')
  async getCycle(
    @CurrentUser() user: AuthUser,
    @Param() params: AutomationPathParamsDto,
  ) {
    const cycle = await this.automationsService.getCycle(user, params.uuid);
    if (!cycle) {
      throw new NotFoundException({
        error: {
          code: 'COMMERCIAL_CYCLE_NOT_FOUND',
          message: 'Commercial cycle not found',
        },
      });
    }
    return { data: cycle };
  }

  @Get('automations')
  async listAutomations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryAutomationsDto,
  ) {
    return this.automationsService.listAutomations(user, query);
  }

  @Get('automations/:uuid')
  async getAutomation(
    @CurrentUser() user: AuthUser,
    @Param() params: AutomationPathParamsDto,
  ) {
    const automation = await this.automationsService.getAutomation(
      user,
      params.uuid,
    );
    if (!automation) {
      throw new NotFoundException({
        error: {
          code: 'AUTOMATION_NOT_FOUND',
          message: 'Automation not found',
        },
      });
    }
    return { data: automation };
  }

  @Post('automations/:uuid/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async cancelAutomation(
    @CurrentUser() user: AuthUser,
    @Param() params: AutomationPathParamsDto,
  ) {
    const automation = await this.automationsService.cancelAutomation(
      user,
      params,
    );
    return {
      data: { uuid: automation.uuid, status: 'CANCELLED', success: true },
    };
  }
}
