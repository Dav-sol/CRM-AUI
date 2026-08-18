import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

// Read-only dashboard (Flujo 09); all authenticated organization roles
// (precedent HG-3 of 018/019) — JwtAuthGuard only.
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async summary(@CurrentUser() user: AuthUser) {
    return { data: await this.dashboardService.summary(user) };
  }

  @Get('campaigns')
  async campaigns(@CurrentUser() user: AuthUser) {
    return { data: await this.dashboardService.campaigns(user) };
  }

  @Get('activity')
  async activity(@CurrentUser() user: AuthUser) {
    return { data: await this.dashboardService.activity(user) };
  }
}
