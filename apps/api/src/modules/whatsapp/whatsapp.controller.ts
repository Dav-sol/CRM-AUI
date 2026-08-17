import {
  Body,
  Controller,
  Get,
  Headers,
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
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ConversationPathParamsDto } from './dto/conversation-path-params.dto';
import { MessagePathParamsDto } from './dto/message-path-params.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { WhatsappService } from './whatsapp.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('conversations')
  async listConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryConversationsDto,
  ) {
    return this.whatsappService.listConversations(user, query);
  }

  @Get('conversations/:uuid')
  async getConversation(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationPathParamsDto,
  ) {
    const conversation = await this.whatsappService.getConversation(
      user,
      params,
    );
    if (!conversation) {
      throw new NotFoundException({
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      });
    }
    return { data: conversation };
  }

  @Get('messages')
  async listMessages(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMessagesDto,
  ) {
    return this.whatsappService.listMessages(user, query);
  }

  @Get('messages/:uuid')
  async getMessage(
    @CurrentUser() user: AuthUser,
    @Param() params: MessagePathParamsDto,
  ) {
    const message = await this.whatsappService.getMessage(user, params.uuid);
    if (!message) {
      throw new NotFoundException({
        error: { code: 'MESSAGE_NOT_FOUND', message: 'Message not found' },
      });
    }
    return { data: message };
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SendMessageDto,
  ) {
    const message = await this.whatsappService.sendManualMessage(
      user,
      body,
      idempotencyKey,
    );
    return { data: message };
  }
}
