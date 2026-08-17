import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { ConversationsService } from './conversations.service';
import {
  AssignConversationDto,
  ConversationParamsDto,
  CreateConversationNoteDto,
  CreateConversationTagDto,
  CreateQuickReplyDto,
  QuickReplyPathParamsDto,
  QueryConversationTagsDto,
  QueryQuickRepliesDto,
  ReplyConversationDto,
  TagPathParamsDto,
  TagUuidPathParamsDto,
  UpdateConversationTagDto,
  UpdateQuickReplyDto,
} from './dto/conversations.dto';

const MANAGER_ROLES = ['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE'] as const;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  // Asesor reply (Flujo 07 step 3)

  @Post('conversations/:uuid/messages')
  @HttpCode(HttpStatus.CREATED)
  async reply(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ReplyConversationDto,
  ) {
    const message = await this.conversationsService.reply(
      user,
      params,
      body,
      idempotencyKey,
    );
    return { data: message };
  }

  // Assignment / transfer (FR-004)

  @Post('conversations/:uuid/assign')
  @HttpCode(HttpStatus.OK)
  async assign(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Body() body: AssignConversationDto,
  ) {
    return { data: await this.conversationsService.assign(user, params, body) };
  }

  @Post('conversations/:uuid/transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Body() body: AssignConversationDto,
  ) {
    return {
      data: await this.conversationsService.transfer(user, params, body),
    };
  }

  // Lifecycle transitions (FR-005)

  @Post('conversations/:uuid/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
  ) {
    return { data: await this.conversationsService.close(user, params) };
  }

  @Post('conversations/:uuid/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
  ) {
    return { data: await this.conversationsService.archive(user, params) };
  }

  @Post('conversations/:uuid/reopen')
  @HttpCode(HttpStatus.OK)
  async reopen(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
  ) {
    return { data: await this.conversationsService.reopen(user, params) };
  }

  // Notes (FR-007)

  @Post('conversations/:uuid/notes')
  @HttpCode(HttpStatus.CREATED)
  async addNote(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Body() body: CreateConversationNoteDto,
  ) {
    return {
      data: await this.conversationsService.addNote(user, params, body),
    };
  }

  @Get('conversations/:uuid/notes')
  async listNotes(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
  ) {
    return { data: await this.conversationsService.listNotes(user, params) };
  }

  // Tags on a conversation (FR-006)

  @Post('conversations/:uuid/tags/:tagUuid')
  @HttpCode(HttpStatus.OK)
  async assignTag(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Param() tagParams: TagUuidPathParamsDto,
  ) {
    return {
      data: await this.conversationsService.assignTag(user, params, tagParams),
    };
  }

  @Delete('conversations/:uuid/tags/:tagUuid')
  @HttpCode(HttpStatus.OK)
  async removeTag(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationParamsDto,
    @Param() tagParams: TagUuidPathParamsDto,
  ) {
    return {
      data: await this.conversationsService.removeTag(user, params, tagParams),
    };
  }

  // Tag catalog (FR-006)

  @Get('conversation-tags')
  async listTags(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryConversationTagsDto,
  ) {
    return this.conversationsService.listTags(user, query);
  }

  @Post('conversation-tags')
  @Roles(...MANAGER_ROLES)
  async createTag(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateConversationTagDto,
  ) {
    return {
      data: await this.conversationsService.createTag(user, body),
    };
  }

  @Patch('conversation-tags/:uuid')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  async updateTag(
    @CurrentUser() user: AuthUser,
    @Param() params: TagPathParamsDto,
    @Body() body: UpdateConversationTagDto,
  ) {
    return {
      data: await this.conversationsService.updateTag(user, params, body),
    };
  }

  @Delete('conversation-tags/:uuid')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  async deleteTag(
    @CurrentUser() user: AuthUser,
    @Param() params: TagPathParamsDto,
  ) {
    return {
      data: await this.conversationsService.deleteTag(user, params),
    };
  }

  // Quick replies (FR-008)

  @Get('quick-replies')
  async listQuickReplies(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryQuickRepliesDto,
  ) {
    return this.conversationsService.listQuickReplies(user, query);
  }

  @Post('quick-replies')
  @Roles(...MANAGER_ROLES)
  async createQuickReply(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateQuickReplyDto,
  ) {
    return {
      data: await this.conversationsService.createQuickReply(user, body),
    };
  }

  @Patch('quick-replies/:uuid')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  async updateQuickReply(
    @CurrentUser() user: AuthUser,
    @Param() params: QuickReplyPathParamsDto,
    @Body() body: UpdateQuickReplyDto,
  ) {
    return {
      data: await this.conversationsService.updateQuickReply(
        user,
        params,
        body,
      ),
    };
  }

  @Delete('quick-replies/:uuid')
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  async deleteQuickReply(
    @CurrentUser() user: AuthUser,
    @Param() params: QuickReplyPathParamsDto,
  ) {
    return {
      data: await this.conversationsService.deleteQuickReply(user, params),
    };
  }
}
