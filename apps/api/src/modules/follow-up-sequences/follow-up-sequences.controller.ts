import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { FollowUpSequencesService } from './follow-up-sequences.service';
import { FollowUpSequencePathParamsDto } from './dto/follow-up-sequence-path-params.dto';
import { CreateFollowUpSequenceDto } from './dto/create-follow-up-sequence.dto';
import { UpdateFollowUpSequenceDto } from './dto/update-follow-up-sequence.dto';
import { QueryFollowUpSequencesDto } from './dto/query-follow-up-sequences.dto';

// HG-FUS-01: writes restricted to ADMINISTRADOR and GERENTE; reads open to
// every authenticated organization role (same split as Conversations).
const MANAGER_ROLES = ['ADMINISTRADOR', 'GERENTE'] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FollowUpSequencesController {
  constructor(private readonly service: FollowUpSequencesService) {}

  @Post('follow-up-sequences')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...MANAGER_ROLES)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateFollowUpSequenceDto,
  ) {
    return { data: await this.service.create(user, body) };
  }

  @Get('follow-up-sequences')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryFollowUpSequencesDto,
  ) {
    return await this.service.list(user, query);
  }

  @Get('follow-up-sequences/:uuid')
  async detail(
    @CurrentUser() user: AuthUser,
    @Param() params: FollowUpSequencePathParamsDto,
  ) {
    return { data: await this.service.detail(user, params.uuid) };
  }

  @Patch('follow-up-sequences/:uuid')
  @Roles(...MANAGER_ROLES)
  async update(
    @CurrentUser() user: AuthUser,
    @Param() params: FollowUpSequencePathParamsDto,
    @Body() body: UpdateFollowUpSequenceDto,
  ) {
    return { data: await this.service.update(user, params.uuid, body) };
  }

  @Delete('follow-up-sequences/:uuid')
  @HttpCode(HttpStatus.OK)
  @Roles(...MANAGER_ROLES)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param() params: FollowUpSequencePathParamsDto,
  ) {
    return { data: await this.service.remove(user, params.uuid) };
  }
}
