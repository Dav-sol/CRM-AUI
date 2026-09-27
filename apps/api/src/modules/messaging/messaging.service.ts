import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import type { SmsProvider } from './sms-provider.interface';
import { SMS_PROVIDER } from './sms-provider.interface';
import { countSmsSegments } from './sms-segments.util';
import {
  ChannelType,
  MessageDirection,
  MessageStatus,
  MessageType,
} from '@prisma/client';

export interface SendMessageInput {
  channel: ChannelType;
  customerId: string;
  organizationId: string;
  content: string;
  automationId?: string;
  campaignId?: string;
  channelAccountId?: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async sendMessage(
    input: SendMessageInput,
  ): Promise<{ messageId: string; uuid: string }> {
    const { segments } = countSmsSegments(input.content);

    const message = await this.prisma.message.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        conversationId: null,
        automationId: input.automationId,
        channel: input.channel,
        channelAccountId: input.channelAccountId,
        type: MessageType.AUTOMATIC,
        content: input.content,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.QUEUED,
        segmentCount: segments,
      },
    });

    return { messageId: message.id, uuid: message.uuid };
  }
}
