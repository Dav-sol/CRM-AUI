import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CampaignPathParamsDto } from './dto/campaign-path-params.dto';
import { PreviewSegmentDto } from './dto/preview-segment.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';

// HG-3: all authenticated organization roles manage campaigns — JwtAuthGuard only.
@Controller()
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateCampaignDto) {
    return { data: await this.campaignsService.create(user, body) };
  }

  @Get('campaigns')
  async list(@CurrentUser() user: AuthUser, @Query() query: QueryCampaignsDto) {
    return await this.campaignsService.list(user, query);
  }

  @Get('campaigns/:uuid')
  async detail(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
  ) {
    return { data: await this.campaignsService.detail(user, params.uuid) };
  }

  @Patch('campaigns/:uuid')
  async update(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
    @Body() body: UpdateCampaignDto,
  ) {
    return {
      data: await this.campaignsService.update(user, params.uuid, body),
    };
  }

  @Post('campaigns/:uuid/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
  ) {
    return { data: await this.campaignsService.activate(user, params.uuid) };
  }

  @Post('campaigns/:uuid/pause')
  @HttpCode(HttpStatus.OK)
  async pause(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
  ) {
    return { data: await this.campaignsService.pause(user, params.uuid) };
  }

  @Post('campaigns/:uuid/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
  ) {
    return { data: await this.campaignsService.resume(user, params.uuid) };
  }

  @Post('campaigns/:uuid/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
  ) {
    return { data: await this.campaignsService.cancel(user, params.uuid) };
  }

  @Post('campaigns/:uuid/preview-segment')
  @HttpCode(HttpStatus.OK)
  async previewSegment(
    @CurrentUser() user: AuthUser,
    @Param() params: CampaignPathParamsDto,
    @Body() body?: PreviewSegmentDto,
  ) {
    return {
      data: await this.campaignsService.previewSegment(user, params.uuid, body),
    };
  }
}
