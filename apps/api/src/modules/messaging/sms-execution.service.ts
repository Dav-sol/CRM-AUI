import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import {
  MessageDirection,
  MessageStatus,
  MessageType,
  ChannelType,
  CustomerStatus,
} from '@prisma/client';
import type { SmsProvider } from './sms-provider.interface';
import { SMS_PROVIDER } from './sms-provider.interface';
import { countSmsSegments } from './sms-segments.util';
import { EventEmitter2 } from '@nestjs/event-emitter';

const MAX_AUTOMATION_RETRIES = 3;
const MODULE = 'sms';

@Injectable()
export class SmsExecutionService {
  private readonly logger = new Logger(SmsExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async executeOneAutomation(automationId: string): Promise<void> {
    const automation = await this.prisma.automation.findUnique({
      where: { id: automationId },
      include: {
        purchase: {
          include: {
            customer: true,
            product: { select: { name: true } },
          },
        },
        organization: { select: { name: true } },
        campaign: { select: { template: true } },
      },
    });

    if (!automation) {
      this.logger.warn(`Automation ${automationId} not found, skipping`);
      return;
    }

    const customer = automation.purchase.customer;
    if (customer.status !== CustomerStatus.ACTIVE) {
      return;
    }

    if (!customer.phone) {
      await this.markAutomationFailed(automation.id, 'customer_no_phone');
      return;
    }

    const content = this.buildContent(automation);
    if (!content) {
      await this.markAutomationFailed(automation.id, 'empty_content');
      return;
    }

    const { segments } = countSmsSegments(content);

    let message: { id: string; uuid: string };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.automation.updateMany({
          where: { id: automation.id, status: { in: ['SCHEDULED', 'ERROR'] } },
          data: { status: 'EXECUTING' },
        });
        if (updated.count === 0) {
          return null;
        }

        const created = await tx.message.create({
          data: {
            organizationId: automation.organizationId,
            conversationId: null,
            customerId: customer.id,
            automationId: automation.id,
            channel: ChannelType.SMS,
            type: MessageType.AUTOMATIC,
            content,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.QUEUED,
            segmentCount: segments,
          },
        });
        return { message: created };
      });

      if (!result) {
        return;
      }
      message = result.message;
    } catch (error) {
      this.logger.error(
        `SMS execution failed for automation ${automation.uuid}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.markAutomationFailed(automation.id, 'internal_error');
      return;
    }

    this.eventEmitter.emit('MessageQueued', {
      messageId: message.uuid,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
    });

    try {
      const smsResult = await this.smsProvider.send({
        to: customer.phone,
        from: this.configService.get('sms.sender') ?? '',
        content,
        organizationId: automation.organizationId,
        messageId: message.id,
      });

      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          providerMessageId: smsResult.providerMessageId,
          provider: this.smsProvider.getName(),
          sentAt: new Date(),
          segmentCount: smsResult.segments ?? segments,
          actualCost: smsResult.cost ?? null,
          currency: smsResult.currency ?? null,
        },
      });

      await this.prisma.automation.update({
        where: { id: automation.id },
        data: {
          status: 'EXECUTED',
          executedDate: new Date(),
        },
      });

      this.eventEmitter.emit('AutomationExecuted', {
        automationId: automation.uuid,
        campaignId: automation.campaignId,
        organizationId: automation.organizationId,
      });
    } catch (error) {
      this.logger.error(
        `SMS provider send failed for automation ${automation.uuid}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failureReason:
            error instanceof Error ? error.message : 'provider_error',
        },
      });
      await this.markAutomationFailed(automation.id, 'provider_error');
    }
  }

  private buildContent(automation: {
    messageTemplate?: string | null;
    campaign?: { template: string } | null;
    purchase: {
      purchaseDate: Date;
      warrantyExpiresAt?: Date | null;
      customer: { name: string };
      product?: { name: string } | null;
    };
    organization: { name: string } | null;
  }): string | null {
    const raw =
      automation.messageTemplate ?? automation.campaign?.template ?? null;
    if (!raw) {
      return null;
    }

    const customerName = automation.purchase.customer.name;
    const productName = automation.purchase.product?.name ?? '';
    const organizationName = automation.organization?.name ?? '';

    return raw
      .replace(/\{customerName\}/g, customerName)
      .replace(/\{productName\}/g, productName)
      .replace(/\{organizationName\}/g, organizationName);
  }

  private async markAutomationFailed(
    automationId: string,
    reason: string,
  ): Promise<void> {
    const automation = await this.prisma.automation.findUnique({
      where: { id: automationId },
      select: { id: true, retryCount: true, organizationId: true, uuid: true },
    });
    if (!automation) return;

    const isTerminal =
      reason === 'customer_no_phone' ||
      automation.retryCount >= MAX_AUTOMATION_RETRIES - 1;

    await this.prisma.automation.update({
      where: { id: automationId },
      data: {
        status: isTerminal ? 'ERROR' : 'ERROR',
        retryCount: { increment: 1 },
      },
    });

    this.eventEmitter.emit('AutomationFailed', {
      automationId: automation.uuid,
      reason,
      organizationId: automation.organizationId,
    });

    await this.auditService.record({
      module: MODULE,
      action: 'automation.failed',
      outcome: 'failure',
      userId: null,
      organizationId: automation.organizationId,
      description: `SMS execution failed automation=${automation.uuid} reason=${reason}`,
      metadata: { automationId: automation.uuid, reason },
    });
  }
}
