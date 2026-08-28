import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { QueryReportDto } from './dto/query-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('customers')
  async customers(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryReportDto,
  ) {
    return { data: await this.reportsService.customers(user, query) };
  }

  @Get('purchases')
  async purchases(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryReportDto,
  ) {
    return { data: await this.reportsService.purchases(user, query) };
  }

  @Get('campaigns')
  async campaigns(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryReportDto,
  ) {
    return { data: await this.reportsService.campaigns(user, query) };
  }

  @Get('automations')
  async automations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryReportDto,
  ) {
    return { data: await this.reportsService.automations(user, query) };
  }

  @Get('messages')
  async messages(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryReportDto,
  ) {
    return { data: await this.reportsService.messages(user, query) };
  }
}
