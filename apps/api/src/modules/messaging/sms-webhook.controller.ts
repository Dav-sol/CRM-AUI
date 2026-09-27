import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../core/database/prisma.service';
import { MessageStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

const STATUS_TRANSITIONS: Record<string, MessageStatus> = {
  queued: MessageStatus.QUEUED,
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
  undeliverable: MessageStatus.FAILED,
  rejected: MessageStatus.FAILED,
};

const ALTIRIA_STATUS_MAP: Record<string, MessageStatus> = {
  ACCEPTD: MessageStatus.SENT,
  DELIVRD: MessageStatus.DELIVERED,
  EXPIRED: MessageStatus.FAILED,
  DELETED: MessageStatus.FAILED,
  UNDELIV: MessageStatus.FAILED,
  REJECTD: MessageStatus.FAILED,
  RECEIVED: MessageStatus.DELIVERED,
};

@Controller('webhooks/sms')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('altiria')
  @HttpCode(HttpStatus.OK)
  async receiveAltiriaDlr(
    @Query() query: Record<string, string>,
  ): Promise<{ status: 'received' }> {
    try {
      const { token, messageUuid, id, status: altiriaStatus } = query;

      const webhookSecret = process.env.SMS_WEBHOOK_SECRET;
      if (!webhookSecret || token !== webhookSecret) {
        throw new ForbiddenException('Invalid webhook token');
      }

      if (!messageUuid || !altiriaStatus) {
        this.logger.debug('Altiria DLR: missing messageUuid or status');
        return { status: 'received' };
      }

      const mappedStatus = ALTIRIA_STATUS_MAP[altiriaStatus];
      if (!mappedStatus) {
        this.logger.debug(
          `Altiria DLR: unknown status "${altiriaStatus}" for ${messageUuid}`,
        );
        return { status: 'received' };
      }

      let message = await this.prisma.message.findFirst({
        where: { uuid: messageUuid },
        select: { id: true, status: true, uuid: true, organizationId: true },
      });

      if (!message && id) {
        message = await this.prisma.message.findFirst({
          where: { providerMessageId: id, provider: 'ALTIRIA' },
          select: { id: true, status: true, uuid: true, organizationId: true },
        });
      }

      if (!message) {
        this.logger.debug(
          `Altiria DLR: unknown messageUuid ${messageUuid} (provider id: ${id})`,
        );
        return { status: 'received' };
      }

      const newStatus = mappedStatus;
      const updateData: Record<string, unknown> = { status: newStatus };

      if (
        newStatus === MessageStatus.SENT &&
        (!message.status || message.status === MessageStatus.QUEUED)
      ) {
        updateData.sentAt = new Date();
      }
      if (newStatus === MessageStatus.DELIVERED) {
        updateData.deliveredAt = new Date();
      }
      if (newStatus === MessageStatus.FAILED) {
        updateData.failureReason = altiriaStatus;
      }

      await this.prisma.message.update({
        where: { id: message.id },
        data: updateData,
      });

      const eventMap: Record<string, string> = {
        [MessageStatus.SENT]: 'MessageSent',
        [MessageStatus.DELIVERED]: 'MessageDelivered',
        [MessageStatus.READ]: 'MessageRead',
        [MessageStatus.FAILED]: 'MessageFailed',
      };

      const eventName = eventMap[newStatus];
      if (eventName) {
        this.eventEmitter.emit(eventName, {
          messageId: message.uuid,
          status: newStatus,
          organizationId: message.organizationId,
        });
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        'Altiria DLR processing failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { status: 'received' };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: 'received' }> {
    try {
      await this.handleStatusUpdate(body);
    } catch (error) {
      this.logger.error(
        'SMS webhook processing failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { status: 'received' };
  }

  private async handleStatusUpdate(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const providerMessageId =
      (payload.messageId as string) ??
      (payload.message_id as string) ??
      (payload.MessageID as string);
    const status =
      (payload.status as string)?.toLowerCase() ??
      (payload.Status as string)?.toLowerCase();

    if (!providerMessageId || !status) {
      this.logger.debug('SMS webhook missing messageId or status, ignoring');
      return;
    }

    const message = await this.prisma.message.findFirst({
      where: {
        providerMessageId,
        provider: { not: null },
      },
      select: { id: true, status: true, uuid: true, organizationId: true },
    });

    if (!message) {
      this.logger.debug(
        `SMS webhook: unknown providerMessageId ${providerMessageId}`,
      );
      return;
    }

    const newStatus = STATUS_TRANSITIONS[status];
    if (!newStatus) {
      this.logger.debug(
        `SMS webhook: unknown status "${status}" for message ${message.uuid}`,
      );
      return;
    }

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === MessageStatus.SENT && !message.status) {
      updateData.sentAt = new Date();
    }
    if (newStatus === MessageStatus.DELIVERED) {
      updateData.deliveredAt = new Date();
    }
    if (newStatus === MessageStatus.FAILED) {
      updateData.failureReason =
        payload.error ?? payload.errorMessage ?? status;
    }

    await this.prisma.message.update({
      where: { id: message.id },
      data: updateData,
    });

    const eventMap: Record<string, string> = {
      [MessageStatus.SENT]: 'MessageSent',
      [MessageStatus.DELIVERED]: 'MessageDelivered',
      [MessageStatus.READ]: 'MessageRead',
      [MessageStatus.FAILED]: 'MessageFailed',
    };

    const eventName = eventMap[newStatus];
    if (eventName) {
      this.eventEmitter.emit(eventName, {
        messageId: message.uuid,
        status: newStatus,
        organizationId: message.organizationId,
      });
    }
  }
}
