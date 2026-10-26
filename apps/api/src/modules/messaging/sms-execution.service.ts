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
import { SendPermitGuard } from '../../core/safety/send-permit.guard';
import { SendBlockedError } from '../../core/safety/send-permit';

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
    private readonly sendPermit: SendPermitGuard,
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

    // AUTO-SAFETY-002: authorization BEFORE the SCHEDULED -> EXECUTING
    // transition and before the `messages` row exists. A denied policy leaves
    // no QUEUED row and no automation state change.
    const permit = this.sendPermit.evaluate(automation.organizationId, 'SMS');
    if (!permit.allowed) {
      this.logger.warn(
        `SMS automation send blocked by policy automation=${automation.uuid} reason=${
          permit.reason ?? 'UNKNOWN'
        }`,
      );
      await this.auditService.record({
        module: MODULE,
        action: 'outbound.send',
        outcome: 'blocked',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic SMS send blocked by policy automation=${automation.uuid}`,
        metadata: {
          automationId: automation.uuid,
          channel: 'SMS',
          reason: permit.reason ?? 'UNKNOWN',
        },
      });
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
      if (error instanceof SendBlockedError) {
        // AUTO-SAFETY-002: security condition, not a provider failure. No
        // retry consumed, no EXECUTED, no scheduledDate change. The only
        // mutation is EXECUTING -> SCHEDULED (guarded), returning the
        // automation to the queue with its original date and retryCount.
        this.logger.warn(
          `SMS automation send blocked by policy automation=${automation.uuid} reason=${error.denialReason}`,
        );
        await this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.FAILED,
            failureReason: 'send_blocked_by_policy',
          },
        });
        await this.prisma.automation.updateMany({
          where: { id: automation.id, status: 'EXECUTING' },
          data: { status: 'SCHEDULED' },
        });
        await this.auditService.record({
          module: MODULE,
          action: 'outbound.send',
          outcome: 'blocked',
          userId: null,
          organizationId: automation.organizationId,
          description: `automatic SMS send blocked by policy automation=${automation.uuid}`,
          metadata: {
            automationId: automation.uuid,
            channel: 'SMS',
            reason: error.denialReason,
          },
        });
        return;
      }
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
        status: 'ERROR',
        // Política B (spec 017 Q8/A8 enmendada, 2026-10-26): un fallo terminal
        // agota el presupuesto de reintentos — retryCount = MAX — para que el
        // filtro del scheduler (`retryCount: { lt: MAX }`) no vuelva a elegir
        // la fila. Es el mismo contrato que `markAutomationTerminal` de
        // WhatsApp. Un fallo recuperable conserva el incremento acotado.
        ...(isTerminal
          ? { retryCount: MAX_AUTOMATION_RETRIES }
          : { retryCount: { increment: 1 } }),
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
