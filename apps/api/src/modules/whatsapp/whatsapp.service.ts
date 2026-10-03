import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  ChannelType,
  ConversationStatus,
  CustomerStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { ConfiguracionesService } from '../configuraciones/configuraciones.service';
import { EligibilityService } from '../lifecycle/eligibility.service';
import {
  brandOf,
  renderTemplate,
  type MessageTemplateVars,
} from '../../common/message-variables';
import { ConversationPathParamsDto } from './dto/conversation-path-params.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  AutomationExecutedPayload,
  AutomationFailedPayload,
  ConversationOpenedPayload,
  MessageEventPayload,
  MessageFailedPayload,
  MessageReceivedPayload,
  MessageSentPayload,
  MessageStatusChangedPayload,
  buildWhatsappEvent,
} from './whatsapp.events';
import { Inject } from '@nestjs/common';
import type {
  InboundWebhookPayload,
  ProviderInboundMessage,
  ProviderSendResult,
  ProviderStatusUpdate,
  WhatsAppProvider,
} from './whatsapp.provider';
import { ProviderSendError, WHATSAPP_PROVIDER } from './whatsapp.provider';
import { PancakeWhatsAppProvider } from './pancake/pancake-whatsapp.provider';
import { PancakeError } from './pancake/pancake.client';

const MODULE = 'whatsapp';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CONVERSATION_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'status']);
const MESSAGE_SORT_FIELDS = new Set(['createdAt', 'sentAt', 'status']);

const SCHEDULER_BATCH_SIZE = 100;

const MAX_AUTOMATION_RETRIES = 3;

// Fase 2 (P0-4): ventana para atribuir una respuesta entrante a la última
// automatización OUTBOUND de la conversación.
const REPLY_ORIGIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const AUTOMATIC_TEMPLATE =
  'Hola {customerName}. {organizationName} te saluda y te envía este mensaje de seguimiento tras tu compra de {productName}.';

interface IdempotencyEntry {
  messageId: string;
  expiresAt: number;
}

export interface AdvisorRef {
  uuid: string;
  firstName: string;
  lastName: string;
}

export interface ConversationTagRef {
  uuid: string;
  name: string;
  color: string | null;
}

export interface ConversationNoteSummary {
  uuid: string;
  author: AdvisorRef;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  uuid: string;
  channel: ChannelType;
  status: ConversationStatus;
  customerId: string | null;
  customer: { uuid: string; name: string; status: CustomerStatus } | null;
  advisorId: string | null;
  advisor: AdvisorRef | null;
  tags: ConversationTagRef[];
  lastMessageAt: string | null;
  messageCount: number;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageSummary[];
  notes: ConversationNoteSummary[];
}

export interface MessageSummary {
  uuid: string;
  conversationId: string | null;
  automationId: string | null;
  inReplyToCampaignId: string | null;
  inReplyToCampaignName: string | null;
  type: MessageType;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MessageDetail extends MessageSummary {
  customer: { uuid: string; name: string; phone: string | null } | null;
}

export interface ListResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

type PrismaClient = Prisma.TransactionClient;

const CONVERSATION_LIST_INCLUDE = {
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
  },
  customer: { select: { uuid: true, name: true, status: true } },
  advisor: { select: { uuid: true, firstName: true, lastName: true } },
  tagAssignments: {
    where: { deletedAt: null },
    select: { tag: { select: { uuid: true, name: true, color: true } } },
  },
} as const;

const CONVERSATION_DETAIL_INCLUDE = {
  ...CONVERSATION_LIST_INCLUDE,
  notes: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      uuid: true,
      content: true,
      createdAt: true,
      author: { select: { uuid: true, firstName: true, lastName: true } },
    },
  },
} as const;

type ConversationWithDetail = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_DETAIL_INCLUDE;
}>;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly idempotencyStore = new Map<string, IdempotencyEntry>();
  private readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(WHATSAPP_PROVIDER)
    private readonly provider: WhatsAppProvider,
    private readonly pancakeProvider: PancakeWhatsAppProvider,
    private readonly configService: ConfigService,
    private readonly configuraciones: ConfiguracionesService,
    private readonly eligibility: EligibilityService,
  ) {}

  // ---------------------------------------------------------------------------
  // Automatic execution (Flujo 05, US1)
  // ---------------------------------------------------------------------------

  async executeDueAutomations(): Promise<void> {
    const due = await this.prisma.automation.findMany({
      where: {
        // SCHEDULED (first attempt) and ERROR (bounded retry, P1) both fire.
        status: { in: ['SCHEDULED', 'ERROR'] },
        retryCount: { lt: MAX_AUTOMATION_RETRIES },
        scheduledDate: { lte: new Date() },
        deletedAt: null,
        // Fase 1: SMS automations are executed by SmsScheduler, not here.
        channel: 'WHATSAPP_CLIENTS',
        OR: [{ campaignId: null }, { campaign: { status: 'ACTIVE' } }],
        purchase: {
          deletedAt: null,
          // Fase 5 (T19): el opt-out detiene los envíos.
          customer: { deletedAt: null, status: 'ACTIVE', noContactAt: null },
        },
      },
      include: {
        purchase: {
          include: {
            customer: true,
            product: { select: { name: true, category: true } },
          },
        },
        organization: { select: { name: true } },
        campaign: {
          select: {
            template: true,
            templateD3: true,
            templateD180: true,
            templateD365: true,
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
      take: SCHEDULER_BATCH_SIZE,
    });

    // Todos los gates transversales de envío viven en EligibilityService
    // (specs/025-lifecycle-postventa §4). Aquí no se reimplementa ninguno: el
    // scheduler solo consulta y salta.
    //
    // La fila NO se reprograma ni se muta cuando un gate bloquea: se salta y
    // sigue SCHEDULED. El salto no cuenta reintento ni emite fallo. La
    // excepción es el hito VENCIDO durante una pausa, que pasa a SKIPPED al
    // reanudar (LifecycleService.resume, §4.5), no en cada tick.
    const now = new Date();
    for (const automation of due) {
      const purchase = automation.purchase;
      const decision = await this.eligibility.evaluate({
        customerId: purchase.customer.id,
        organizationId: automation.organizationId,
        cycleId: automation.commercialCycleId,
        now,
        timeZone: await this.configuraciones.timeZoneOrganizacion(
          automation.organizationId,
        ),
        requiresMaintenanceConsent: this.esEtapaDeMantenimiento(
          automation.messageTemplate,
        ),
      });

      if (!decision.allowed) {
        this.logger.debug(
          `automation skipped automation=${automation.uuid} gate=${
            decision.blockedBy ?? 'UNKNOWN'
          } reason=${decision.reason ?? ''}`,
        );
        continue;
      }

      await this.executeOneAutomation(automation);
    }
  }

  /**
   * ¿Esta automatización es un recordatorio de mantenimiento y por tanto exige
   * consentimiento (G7, §4.7)? Se decide por el texto ya snapshot en la
   * automatización, porque el catálogo de plantillas es independiente y la
   * campaña actual no lo referencia.
   */
  private esEtapaDeMantenimiento(template: string | null): boolean {
    if (!template) return false;
    return template.toLowerCase().includes('revisi');
  }

  // F7: EXECUTING automations whose send was never confirmed within
  // `whatsapp.executingTimeoutMs` are orphaned (crash/hang between the guard
  // transition and the provider confirmation). They return to ERROR so the
  // normal retry mechanism re-picks them (bounded by MAX_AUTOMATION_RETRIES).
  // They are NEVER auto-marked EXECUTED: that would be a false confirmation.
  async expireStuckExecuting(): Promise<void> {
    const timeoutMs =
      this.configService.get<number>('whatsapp.executingTimeoutMs') ?? 600_000;
    if (timeoutMs <= 0) {
      return;
    }
    const cutoff = new Date(Date.now() - timeoutMs);
    const stuck = await this.prisma.automation.findMany({
      where: {
        status: 'EXECUTING',
        updatedAt: { lt: cutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        uuid: true,
        organizationId: true,
        purchaseId: true,
      },
      take: SCHEDULER_BATCH_SIZE,
    });

    for (const automation of stuck) {
      const updated = await this.prisma.automation.updateMany({
        where: { id: automation.id, status: 'EXECUTING' },
        data: {
          status: 'ERROR',
          retryCount: { increment: 1 },
          updatedBy: null,
        },
      });
      if (updated.count === 0) {
        continue;
      }
      this.emit('AutomationFailed', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        failedAt: new Date().toISOString(),
        reason: 'executing_timeout',
      } satisfies AutomationFailedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.failed',
        outcome: 'failure',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution timed out automation=${automation.uuid}`,
        metadata: {
          automationId: automation.uuid,
          reason: 'executing_timeout',
        },
      });
    }
  }

  private async executeOneAutomation(automation: {
    id: string;
    uuid: string;
    organizationId: string;
    purchaseId: string;
    scheduledDate: Date;
    messageTemplate?: string | null;
    purchase: {
      purchaseDate: Date;
      warrantyExpiresAt?: Date | null;
      customer: {
        id: string;
        uuid: string;
        phone: string | null;
        name: string;
        status: CustomerStatus;
      };
      product: { name: string; category?: string | null } | null;
    };
    organization: { name: string } | null;
    campaign?: {
      template: string;
      templateD3: string | null;
      templateD180: string | null;
      templateD365: string | null;
    } | null;
  }): Promise<void> {
    const customer = automation.purchase.customer;
    const content = this.buildAutomaticContent(automation);

    // AU-005: only ACTIVE customers. The query pre-filters; a status change
    // between scan and execution is re-checked inside the transaction.
    if (customer.status !== CustomerStatus.ACTIVE) {
      return;
    }

    let message: { id: string; uuid: string };
    let conversationUuid: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // AU-011: single-row guarded transition — never executes twice.
        // P1 (demo D1): SCHEDULED/ERROR → EXECUTING; EXECUTED only after the
        // provider confirms the send.
        const updated = await tx.automation.updateMany({
          where: { id: automation.id, status: { in: ['SCHEDULED', 'ERROR'] } },
          data: {
            status: 'EXECUTING',
            updatedBy: null,
          },
        });
        if (updated.count === 0) {
          return null;
        }

        const conversation = await this.findOrOpenCustomerConversation(
          tx,
          automation.organizationId,
          customer.id,
          ChannelType.WHATSAPP_CLIENTS,
        );

        const created = await tx.message.create({
          data: {
            organizationId: automation.organizationId,
            conversationId: conversation.id,
            automationId: automation.id,
            type: MessageType.AUTOMATIC,
            content,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.QUEUED,
          },
        });
        return { message: created, conversationUuid: conversation.uuid };
      });
      if (!result) {
        return;
      }
      message = result.message;
      conversationUuid = result.conversationUuid;
    } catch (error) {
      this.logger.error(
        `automatic execution failed for automation ${automation.uuid}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.markAutomationFailed(automation.id);
      this.emit('AutomationFailed', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        failedAt: new Date().toISOString(),
        reason: 'internal_error',
      } satisfies AutomationFailedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.failed',
        outcome: 'failure',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution failed automation=${automation.uuid}`,
        metadata: { automationId: automation.uuid, reason: 'internal_error' },
      });
      return;
    }

    this.emit('MessageQueued', null, automation.organizationId, {
      messageId: message.uuid,
      conversationId: conversationUuid,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
      content,
    } satisfies MessageEventPayload);

    const phone = customer.phone;
    if (!phone) {
      await this.failMessage(
        message,
        automation.organizationId,
        'customer_no_phone',
      );
      await this.markAutomationFailed(automation.id);
      this.emit('AutomationFailed', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        failedAt: new Date().toISOString(),
        reason: 'customer_no_phone',
      } satisfies AutomationFailedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.failed',
        outcome: 'failure',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution failed automation=${automation.uuid}`,
        metadata: {
          automationId: automation.uuid,
          reason: 'customer_no_phone',
        },
      });
      return;
    }

    const simulated = this.isSandboxOrganization(automation.organizationId);
    const usePancake = this.shouldUsePancake(automation.organizationId);
    try {
      const sendResult = usePancake
        ? await this.pancakeProvider.sendTemplate(phone, {
            customer_name: automation.purchase.customer.name,
            product_name: automation.purchase.product?.name ?? '',
            organization_name: automation.organization?.name ?? '',
          })
        : simulated
          ? {
              providerMessageId: `sim-${message.uuid}`,
              providerConversationId: null,
            }
          : await this.provider.sendMessage(phone, content);
      await this.markSent(message, automation.organizationId, sendResult);
      // Only EXECUTED after the send is confirmed (P1, demo D1).
      await this.markAutomationExecuted(automation.id);
      this.emit('AutomationExecuted', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        messageId: message.uuid,
        executedAt: new Date().toISOString(),
        status: 'EXECUTED',
      } satisfies AutomationExecutedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.executed',
        outcome: 'success',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution done automation=${automation.uuid}`,
        metadata: {
          automationId: automation.uuid,
          messageId: message.uuid,
          ...(simulated ? { simulated: true, reason: 'sandbox' } : {}),
        },
      });
    } catch (error) {
      // Pancake rejections must be logged: the CRM otherwise records nothing
      // about why a send was blocked (see specs/API-Pancake/integration.md).
      this.logger.error(
        `automatic send failed automation=${automation.uuid}`,
        error instanceof Error ? error.message : String(error),
      );
      const reason =
        error instanceof ProviderSendError || error instanceof PancakeError
          ? 'provider_error'
          : 'internal_error';
      await this.failMessage(message, automation.organizationId, reason);
      // H5 (Pancake): ambiguous failures (timeout/network) may have reached
      // the provider. They are terminal by default (retryOnAmbiguous=false):
      // auto-retrying could duplicate the message (Pancake has no idempotency
      // key). Non-retryable Pancake errors (auth/404/success=false) are also
      // terminal. Everything else keeps the retryable ERROR path.
      const pancakeTerminal =
        error instanceof PancakeError && error.retryable === false;
      if (pancakeTerminal) {
        await this.markAutomationTerminal(automation.id);
      } else {
        await this.markAutomationFailed(automation.id);
      }
      this.emit('AutomationFailed', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        failedAt: new Date().toISOString(),
        reason,
        ...(pancakeTerminal ? { terminal: true } : {}),
      } satisfies AutomationFailedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.failed',
        outcome: 'failure',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution failed automation=${automation.uuid}`,
        metadata: {
          automationId: automation.uuid,
          reason,
          ...(pancakeTerminal ? { terminal: true } : {}),
        },
      });
    }
  }

  private buildAutomaticContent(automation: {
    scheduledDate: Date;
    messageTemplate?: string | null;
    purchase: {
      purchaseDate: Date;
      warrantyExpiresAt?: Date | null;
      customer: { name: string };
      product: { name: string; category?: string | null } | null;
    };
    organization: { name: string } | null;
    campaign?: {
      template: string;
      templateD3: string | null;
      templateD180: string | null;
      templateD365: string | null;
    } | null;
  }): string {
    // Snapshot template (sequence-generated automations) wins over every
    // heuristic; the automation is self-sufficient at generation time.
    const snapshotTemplate =
      automation.messageTemplate && automation.messageTemplate.length > 0
        ? automation.messageTemplate
        : null;
    if (snapshotTemplate) {
      return renderTemplate(snapshotTemplate, this.varsOf(automation));
    }
    // AU-005 stages: +3 días, +6 meses, +12 meses. La plantilla de etapa
    // gana; si no está definida se usa la plantilla base de la campaña.
    const days = Math.ceil(
      (automation.scheduledDate.getTime() -
        automation.purchase.purchaseDate.getTime()) /
        86_400_000,
    );
    const campaign = automation.campaign;
    const stageTemplate =
      (campaign && days <= 3 && campaign.templateD3) ||
      (campaign && days <= 180 && campaign.templateD180) ||
      (campaign && days <= 365 && campaign.templateD365);
    const template = stageTemplate || campaign?.template || AUTOMATIC_TEMPLATE;
    return renderTemplate(template, this.varsOf(automation));
  }

  private varsOf(automation: {
    purchase: {
      purchaseDate: Date;
      warrantyExpiresAt?: Date | null;
      customer: { name: string };
      product: { name: string; category?: string | null } | null;
    };
    organization: { name: string } | null;
  }): MessageTemplateVars {
    return {
      customerName: automation.purchase.customer.name,
      productName: automation.purchase.product?.name ?? '',
      organizationName: automation.organization?.name ?? '',
      brand: brandOf(
        automation.purchase.product?.category,
        automation.purchase.product?.name,
      ),
      warrantyExpiresAt: automation.purchase.warrantyExpiresAt,
      purchaseDate: automation.purchase.purchaseDate,
    };
  }

  // ---------------------------------------------------------------------------
  // Manual send (Flujo 07, US2)
  // ---------------------------------------------------------------------------

  async sendManualMessage(
    user: AuthUser,
    dto: SendMessageDto,
    idempotencyKey?: string,
  ): Promise<MessageDetail> {
    if (idempotencyKey) {
      const existingId = this.resolveIdempotency(user, idempotencyKey);
      if (existingId) {
        const existing = await this.getMessage(user, existingId);
        if (existing) {
          return existing;
        }
      }
    }

    const customer = await this.findScopedCustomer(user, dto.customerId);
    if (!customer) {
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'customer_not_found' },
      });
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }

    const channel = dto.channel ?? ChannelType.WHATSAPP_CLIENTS;

    const { message, conversationUuid } = await this.prisma.$transaction(
      async (tx) => {
        const conversation = await this.findOrOpenCustomerConversation(
          tx,
          customer.organizationId,
          customer.id,
          channel,
        );
        const created = await tx.message.create({
          data: {
            organizationId: customer.organizationId,
            conversationId: conversation.id,
            type: MessageType.MANUAL,
            content: dto.content,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.QUEUED,
          },
        });
        return { message: created, conversationUuid: conversation.uuid };
      },
    );

    this.emit('MessageQueued', user.id, customer.organizationId, {
      messageId: message.uuid,
      conversationId: conversationUuid,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
      content: dto.content,
    } satisfies MessageEventPayload);

    if (idempotencyKey) {
      this.storeIdempotency(user, idempotencyKey, message.uuid);
    }

    const phone = customer.phone;
    if (!phone) {
      await this.failMessage(
        message,
        customer.organizationId,
        'customer_no_phone',
      );
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'failure',
        userId: user.id,
        organizationId: customer.organizationId,
        description: `manual send failed customer=${customer.uuid}`,
        metadata: { reason: 'customer_no_phone' },
      });
      throw new BadRequestException({
        error: {
          code: 'CUSTOMER_NO_PHONE',
          message: 'Customer has no phone number',
        },
      });
    }

    try {
      const sendResult = await this.sendViaProvider(
        customer.organizationId,
        phone,
        dto.content,
      );
      await this.markSent(message, customer.organizationId, sendResult);
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'success',
        userId: user.id,
        organizationId: customer.organizationId,
        description: `manual message sent customer=${customer.uuid}`,
        metadata: { messageId: message.uuid },
      });
    } catch (error) {
      this.logger.error(
        `manual send failed customer=${customer.uuid}`,
        error instanceof Error ? error.message : String(error),
      );
      const reason =
        error instanceof ProviderSendError || error instanceof PancakeError
          ? 'provider_error'
          : 'internal_error';
      await this.failMessage(message, customer.organizationId, reason);
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'failure',
        userId: user.id,
        organizationId: customer.organizationId,
        description: `manual send failed customer=${customer.uuid}`,
        metadata: { reason },
      });
      throw new BadGatewayException({
        error: {
          code: 'PROVIDER_ERROR',
          message: 'WhatsApp provider could not deliver the message',
        },
      });
    }

    const messageDetail = await this.getMessage(user, message.uuid);
    return messageDetail!;
  }

  // ---------------------------------------------------------------------------
  // Asesor reply (kit 018, Flujo 07 step 3)
  // ---------------------------------------------------------------------------

  async sendReply(
    user: AuthUser,
    conversationUuid: string,
    content: string,
    idempotencyKey?: string,
  ): Promise<MessageDetail | null> {
    if (idempotencyKey) {
      const existingId = this.resolveIdempotency(user, idempotencyKey);
      if (existingId) {
        const existing = await this.getMessage(user, existingId);
        if (existing) {
          return existing;
        }
      }
    }

    const conversation = await this.findScopedConversationForReply(
      user,
      conversationUuid,
    );
    if (!conversation) {
      return null;
    }

    if (conversation.status === ConversationStatus.ARCHIVED) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Archived conversations cannot receive replies',
        },
      });
    }

    // HG-5: reply reopens a CLOSED conversation to OPEN (atomic with message).
    const { message } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          organizationId: conversation.organizationId,
          conversationId: conversation.id,
          type: MessageType.OUTGOING,
          content,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.QUEUED,
        },
      });
      if (conversation.status === ConversationStatus.CLOSED) {
        await tx.conversation.updateMany({
          where: { id: conversation.id, status: ConversationStatus.CLOSED },
          data: { status: ConversationStatus.OPEN },
        });
      }
      return { message: created };
    });

    this.emit('MessageQueued', user.id, conversation.organizationId, {
      messageId: message.uuid,
      conversationId: conversationUuid,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
      content,
    } satisfies MessageEventPayload);

    if (idempotencyKey) {
      this.storeIdempotency(user, idempotencyKey, message.uuid);
    }

    const phone = conversation.customer?.phone ?? null;
    if (!phone) {
      await this.failMessage(
        message,
        conversation.organizationId,
        'customer_no_phone',
      );
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'failure',
        userId: user.id,
        organizationId: conversation.organizationId,
        description: `reply failed conversation=${conversationUuid}`,
        metadata: { reason: 'customer_no_phone' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Customer has no phone number',
        },
      });
    }

    try {
      const sendResult = await this.sendViaProvider(
        conversation.organizationId,
        phone,
        content,
      );
      await this.markSent(message, conversation.organizationId, sendResult);
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'success',
        userId: user.id,
        organizationId: conversation.organizationId,
        description: `reply sent conversation=${conversationUuid}`,
        metadata: { messageId: message.uuid },
      });
    } catch (error) {
      this.logger.error(
        `reply send failed conversation=${conversationUuid}`,
        error instanceof Error ? error.message : String(error),
      );
      const reason =
        error instanceof ProviderSendError || error instanceof PancakeError
          ? 'provider_error'
          : 'internal_error';
      await this.failMessage(message, conversation.organizationId, reason);
      await this.auditService.record({
        module: MODULE,
        action: 'message.send',
        outcome: 'failure',
        userId: user.id,
        organizationId: conversation.organizationId,
        description: `reply failed conversation=${conversationUuid}`,
        metadata: { reason },
      });
      throw new BadGatewayException({
        error: {
          code: 'PROVIDER_ERROR',
          message: 'WhatsApp provider could not deliver the message',
        },
      });
    }

    const messageDetail = await this.getMessage(user, message.uuid);
    return messageDetail!;
  }

  // ---------------------------------------------------------------------------
  // Inbound webhook (Flujo 06, US3) + status callbacks (FR-006)
  // ---------------------------------------------------------------------------

  async handleInboundPayload(payload: InboundWebhookPayload): Promise<void> {
    for (const message of payload.messages) {
      await this.handleInboundMessage(message);
    }
    for (const status of payload.statuses) {
      await this.handleStatusUpdate(status);
    }
  }

  async handleInboundMessage(message: ProviderInboundMessage): Promise<void> {
    const organizationId = this.channelOrganizationId();
    if (!organizationId) {
      return;
    }
    const phone = message.from;

    // Idempotency (HG-13): replayed webhooks are no-ops.
    const existing = await this.prisma.message.findFirst({
      where: {
        organizationId,
        providerMessageId: message.providerMessageId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const customer = await this.findOrCreateInboundCustomer(
      organizationId,
      phone,
    );
    let conversation: { id: string; uuid: string; alreadyOpen: boolean };

    try {
      conversation = await this.prisma.$transaction(async (tx) => {
        const existingConversation = await this.findOpenCustomerConversation(
          tx,
          organizationId,
          customer.id,
          ChannelType.WHATSAPP_CLIENTS,
        );
        if (existingConversation) {
          return { ...existingConversation, alreadyOpen: true };
        }
        const created = await tx.conversation.create({
          data: {
            organizationId,
            customerId: customer.id,
            channel: ChannelType.WHATSAPP_CLIENTS,
            status: ConversationStatus.OPEN,
          },
        });
        return { id: created.id, uuid: created.uuid, alreadyOpen: false };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }

    let created: { uuid: string };
    try {
      const replyOrigin = await this.resolveReplyOrigin(conversation.id);
      const row = await this.prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          type: MessageType.INCOMING,
          content: message.text,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.SENT,
          providerMessageId: message.providerMessageId,
          providerConversationId: message.providerConversationId,
          sentAt: this.toDate(message.timestamp),
          ...(replyOrigin
            ? {
                inReplyToAutomationId: replyOrigin.automationId,
                inReplyToCampaignId: replyOrigin.campaignId,
              }
            : {}),
        },
      });
      created = { uuid: row.uuid };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }

    await this.auditService.record({
      module: MODULE,
      action: 'message.received',
      outcome: 'success',
      userId: null,
      organizationId,
      description: `inbound message received from=${phone}`,
      metadata: { messageId: created.uuid, conversationId: conversation.uuid },
    });

    if (!conversation.alreadyOpen) {
      await this.auditService.record({
        module: MODULE,
        action: 'conversation.opened',
        outcome: 'success',
        userId: null,
        organizationId,
        description: `conversation opened from=${phone}`,
        metadata: {
          conversationId: conversation.uuid,
          customerId: customer.uuid,
        },
      });
      this.emit('ConversationOpened', null, organizationId, {
        conversationId: conversation.uuid,
        organizationId,
        channel: ChannelType.WHATSAPP_CLIENTS,
        customerId: customer.uuid,
        openedAt: new Date().toISOString(),
        firstMessageId: created.uuid,
      } satisfies ConversationOpenedPayload);
    }

    this.emit('MessageReceived', null, organizationId, {
      messageId: created.uuid,
      conversationId: conversation.uuid,
      direction: MessageDirection.INBOUND,
      status: MessageStatus.SENT,
      content: message.text,
      receivedAt: new Date().toISOString(),
      from: phone,
    } satisfies MessageReceivedPayload);
  }

  async handleStatusUpdate(update: ProviderStatusUpdate): Promise<void> {
    const organizationId = this.channelOrganizationId();
    if (!organizationId) {
      return;
    }
    const timestamp = this.toDate(update.timestamp);
    const transition = STATUS_TRANSITIONS[update.status];
    if (!transition) {
      return;
    }

    const result = await this.prisma.message.updateMany({
      where: {
        organizationId,
        providerMessageId: update.providerMessageId,
        status:
          typeof transition.from === 'string'
            ? transition.from
            : { in: transition.from },
        deletedAt: null,
      },
      data: {
        status: transition.to,
        ...(transition.to === MessageStatus.SENT
          ? {
              sentAt: timestamp,
              providerConversationId: update.providerConversationId,
            }
          : transition.to === MessageStatus.DELIVERED
            ? { deliveredAt: timestamp }
            : transition.to === MessageStatus.READ
              ? { readAt: timestamp }
              : {}),
      },
    });
    if (result.count === 0) {
      return;
    }

    const { uuid, conversationId } = await this.findMessageUuidByProviderId(
      organizationId,
      update.providerMessageId,
    );
    this.emit(transition.event, null, organizationId, {
      messageId: uuid,
      conversationId,
      direction: MessageDirection.OUTBOUND,
      status: transition.to,
      changedAt: new Date().toISOString(),
    } satisfies MessageStatusChangedPayload);
  }

  // ---------------------------------------------------------------------------
  // Reads (US4, US5)
  // ---------------------------------------------------------------------------

  async listConversations(
    user: AuthUser,
    query: QueryConversationsDto,
  ): Promise<ListResult<ConversationSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildConversationListWhere(user, query);

    const [total, conversations] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_LIST_INCLUDE,
        orderBy: this.buildSort(
          query.sort,
          CONVERSATION_SORT_FIELDS,
          '-createdAt',
        ),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: conversations.map(toConversationSummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getConversation(
    user: AuthUser,
    params: ConversationPathParamsDto,
  ): Promise<ConversationDetail | null> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      return null;
    }
    const detail = toConversationDetail(conversation);

    // Fase 2 (P0-4): resuelve el nombre de la campaña para mensajes que
    // respondieron a una automatización (badge "Respondió a {campaña}").
    const campaignIds = detail.messages
      .map((message) => message.inReplyToCampaignId)
      .filter((id): id is string => Boolean(id));
    if (campaignIds.length > 0) {
      const campaigns = await this.prisma.campaign.findMany({
        where: { uuid: { in: [...new Set(campaignIds)] } },
        select: { uuid: true, name: true },
      });
      const nameByUuid = new Map(
        campaigns.map((campaign) => [campaign.uuid, campaign.name]),
      );
      detail.messages = detail.messages.map((message) =>
        message.inReplyToCampaignId
          ? {
              ...message,
              inReplyToCampaignName:
                nameByUuid.get(message.inReplyToCampaignId) ?? null,
            }
          : message,
      );
    }

    return detail;
  }

  async listMessages(
    user: AuthUser,
    query: QueryMessagesDto,
  ): Promise<ListResult<MessageSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildMessageListWhere(user, query);

    const [total, messages] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where,
        orderBy: this.buildSort(query.sort, MESSAGE_SORT_FIELDS, '-createdAt'),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: messages.map(toMessageSummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getMessage(
    user: AuthUser,
    uuid: string,
  ): Promise<MessageDetail | null> {
    const message = await this.findScopedMessage(user, uuid);
    if (!message) {
      return null;
    }
    return toMessageDetail(message);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private channelOrganizationId(): string | null {
    return (
      this.configService.get<string>('whatsapp.defaultOrganizationId') ?? null
    );
  }

  // Decisión 4: an inbound message from an unrecognized number auto-creates a
  // minimal PENDING contact (codcli W{phone}) linked to the conversation, so the
  // asesor can reply and later enrich/verify it. This never creates a purchase
  // nor triggers AU-001 (the cycle starts only with a valid purchase).
  private async findOrCreateInboundCustomer(
    organizationId: string,
    phone: string,
  ): Promise<{ id: string; uuid: string }> {
    const normalized = normalizePhone(phone);
    const existing = await this.prisma.customer.findMany({
      where: {
        organizationId,
        deletedAt: null,
        phone: { not: null },
      },
      select: { id: true, uuid: true, phone: true },
      take: 20,
    });
    const match = existing.find(
      (customer) =>
        customer.phone && normalizePhone(customer.phone) === normalized,
    );
    if (match) {
      return { id: match.id, uuid: match.uuid };
    }

    const baseCodcli = `W${normalized}`;
    const placeholderName = `Contacto WhatsApp +${phone}`;
    const createPending = (codcli: string) =>
      this.prisma.customer.create({
        data: {
          organizationId,
          codcli,
          name: placeholderName,
          phone,
          status: CustomerStatus.PENDING,
          createdBy: null,
        },
        select: { id: true, uuid: true },
      });
    try {
      return await createPending(baseCodcli);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // A concurrent webhook likely created the same contact: reuse it
        // before falling back to a suffixed codcli.
        const again = await this.prisma.customer.findMany({
          where: {
            organizationId,
            deletedAt: null,
            phone: { not: null },
          },
          select: { id: true, uuid: true, phone: true },
          take: 20,
        });
        const raceMatch = again.find(
          (customer) =>
            customer.phone && normalizePhone(customer.phone) === normalized,
        );
        if (raceMatch) {
          return { id: raceMatch.id, uuid: raceMatch.uuid };
        }
        return await createPending(
          `${baseCodcli}-${Math.random().toString(36).slice(2, 8)}`,
        );
      }
      throw error;
    }
  }

  private async findScopedCustomer(
    user: AuthUser,
    uuid: string,
  ): Promise<{
    id: string;
    uuid: string;
    organizationId: string;
    phone: string | null;
  } | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.customer.findFirst({
        where: {
          uuid,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
        select: { id: true, uuid: true, organizationId: true, phone: true },
      });
    }
    return this.prisma.customer.findFirst({
      where: { uuid, deletedAt: null },
      select: { id: true, uuid: true, organizationId: true, phone: true },
    });
  }

  // Fase 2 (P0-4): resuelve el origen de una respuesta entrante. Si en la
  // conversación hubo una automatización OUTBOUND reciente (dentro de la
  // ventana), el mensaje entrante se atribuye a esa automatización/campaña.
  private async resolveReplyOrigin(
    conversationId: string,
  ): Promise<{ automationId: string; campaignId: string | null } | null> {
    const since = new Date(Date.now() - REPLY_ORIGIN_WINDOW_MS);
    const last = await this.prisma.message.findFirst({
      where: {
        conversationId,
        type: MessageType.AUTOMATIC,
        direction: MessageDirection.OUTBOUND,
        automationId: { not: null },
        createdAt: { gte: since },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { automationId: true },
    });
    if (!last?.automationId) {
      return null;
    }
    const automation = await this.prisma.automation.findUnique({
      where: { id: last.automationId },
      select: { uuid: true, campaignId: true },
    });
    if (!automation) {
      return null;
    }
    return {
      automationId: automation.uuid,
      campaignId: automation.campaignId,
    };
  }

  private async findOrOpenCustomerConversation(
    tx: PrismaClient,
    organizationId: string,
    customerId: string,
    channel: ChannelType,
  ): Promise<{ id: string; uuid: string }> {
    const existing = await this.findOpenCustomerConversation(
      tx,
      organizationId,
      customerId,
      channel,
    );
    if (existing) {
      return existing;
    }
    return tx.conversation.create({
      data: {
        organizationId,
        customerId,
        channel,
        status: ConversationStatus.OPEN,
      },
    });
  }

  private findOpenCustomerConversation(
    tx: PrismaClient,
    organizationId: string,
    customerId: string,
    channel: ChannelType,
  ): Promise<{ id: string; uuid: string } | null> {
    return tx.conversation.findFirst({
      where: {
        organizationId,
        customerId,
        channel,
        status: ConversationStatus.OPEN,
        deletedAt: null,
      },
      select: { id: true, uuid: true },
    });
  }

  private async findScopedConversation(
    user: AuthUser,
    uuid: string,
  ): Promise<ConversationWithDetail | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.conversation.findFirst({
        where: {
          uuid,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
        include: CONVERSATION_DETAIL_INCLUDE,
      });
    }
    return this.prisma.conversation.findFirst({
      where: { uuid, deletedAt: null },
      include: CONVERSATION_DETAIL_INCLUDE,
    });
  }

  private async findScopedConversationForReply(
    user: AuthUser,
    uuid: string,
  ): Promise<{
    id: string;
    uuid: string;
    organizationId: string;
    status: ConversationStatus;
    customer: { phone: string | null } | null;
  } | null> {
    const where: Prisma.ConversationWhereInput =
      user.accountType === 'ORGANIZATION'
        ? {
            uuid,
            organizationId: user.organizationId ?? undefined,
            deletedAt: null,
          }
        : { uuid, deletedAt: null };
    return this.prisma.conversation.findFirst({
      where,
      select: {
        id: true,
        uuid: true,
        organizationId: true,
        status: true,
        customer: { select: { phone: true } },
      },
    });
  }

  private async findScopedMessage(
    user: AuthUser,
    uuid: string,
  ): Promise<Prisma.MessageGetPayload<{
    include: typeof MESSAGE_DETAIL_INCLUDE;
  }> | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.message.findFirst({
        where: {
          uuid,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
        include: MESSAGE_DETAIL_INCLUDE,
      });
    }
    return this.prisma.message.findFirst({
      where: { uuid, deletedAt: null },
      include: MESSAGE_DETAIL_INCLUDE,
    });
  }

  private buildConversationListWhere(
    user: AuthUser,
    query: QueryConversationsDto,
  ): Prisma.ConversationWhereInput {
    const where: Prisma.ConversationWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.channel) {
      where.channel = query.channel;
    }
    if (query.customerId) {
      where.customer = { uuid: query.customerId };
    }
    if (query.name?.trim()) {
      where.customer = {
        ...(where.customer as Prisma.CustomerWhereInput),
        name: { contains: query.name.trim(), mode: 'insensitive' },
      };
    }
    if (query.advisorId) {
      where.advisor = { uuid: query.advisorId };
    }
    if (query.assigned === 'true') {
      where.advisor = { isNot: null };
    }
    if (query.assigned === 'false') {
      where.advisor = { is: null };
    }
    if (query.tagIds) {
      const tagUuids = query.tagIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (tagUuids.length > 0) {
        where.tagAssignments = {
          some: { deletedAt: null, tag: { uuid: { in: tagUuids } } },
        };
      }
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = this.resolveDateBoundary(
          query.createdFrom,
          false,
        );
      }
      if (query.createdTo) {
        where.createdAt.lte = this.resolveDateBoundary(query.createdTo, true);
      }
    }
    return where;
  }

  private buildMessageListWhere(
    user: AuthUser,
    query: QueryMessagesDto,
  ): Prisma.MessageWhereInput {
    const where: Prisma.MessageWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.direction) {
      where.direction = query.direction;
    }
    if (query.conversationId) {
      where.conversation = { uuid: query.conversationId };
    }
    if (query.automationId) {
      where.automation = { uuid: query.automationId };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = this.resolveDateBoundary(
          query.createdFrom,
          false,
        );
      }
      if (query.createdTo) {
        where.createdAt.lte = this.resolveDateBoundary(query.createdTo, true);
      }
    }
    return where;
  }

  private resolveDateBoundary(value: string, upper: boolean): Date {
    if (DATE_ONLY_PATTERN.test(value)) {
      return upper
        ? new Date(`${value}T23:59:59.999Z`)
        : new Date(`${value}T00:00:00.000Z`);
    }
    return new Date(value);
  }

  private buildSort(
    sort: string | undefined,
    allowed: Set<string>,
    fallback: string,
  ): Record<string, 'asc' | 'desc'> {
    const field = (sort ?? fallback).replace(/^-/, '');
    if (!allowed.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? fallback).startsWith('-') ? 'desc' : 'asc';
    return { [field]: direction };
  }

  private async markSent(
    message: { id: string; uuid: string },
    organizationId: string,
    result: {
      providerMessageId: string;
      providerConversationId: string | null;
    },
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        providerConversationId: result.providerConversationId,
      },
    });
    this.emit('MessageSent', null, organizationId, {
      messageId: message.uuid,
      conversationId: '',
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.SENT,
      sentAt: new Date().toISOString(),
    } satisfies MessageSentPayload);
  }

  private async failMessage(
    message: { id: string; uuid: string },
    organizationId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.FAILED },
    });
    this.emit('MessageFailed', null, organizationId, {
      messageId: message.uuid,
      conversationId: '',
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.FAILED,
      failedAt: new Date().toISOString(),
      reason,
    } satisfies MessageFailedPayload);
  }

  // P1 (demo D1): the automation only reaches EXECUTED after the provider
  // confirms the send. Guarded single-row transition on EXECUTING.
  private async markAutomationExecuted(automationId: string): Promise<void> {
    await this.prisma.automation.updateMany({
      where: { id: automationId, status: 'EXECUTING' },
      data: { status: 'EXECUTED', executedDate: new Date(), updatedBy: null },
    });
  }

  private async markAutomationFailed(automationId: string): Promise<void> {
    await this.prisma.automation.updateMany({
      where: { id: automationId, status: 'EXECUTING' },
      data: {
        status: 'ERROR',
        retryCount: { increment: 1 },
        updatedBy: null,
      },
    });
  }

  // H5: a failure that must not be auto-retried (ambiguous/terminal) lands in
  // ERROR with retryCount exhausted, so the scheduler never re-picks it.
  private async markAutomationTerminal(automationId: string): Promise<void> {
    await this.prisma.automation.updateMany({
      where: { id: automationId, status: 'EXECUTING' },
      data: {
        status: 'ERROR',
        retryCount: MAX_AUTOMATION_RETRIES,
        updatedBy: null,
      },
    });
  }

  private isSandboxOrganization(organizationId: string): boolean {
    const sandbox = this.configService.get<string[]>(
      'whatsapp.sandboxOrganizations',
    );
    return Array.isArray(sandbox) && sandbox.includes(organizationId);
  }

  // Pancake is org-scoped: only PANCAKE_ORGANIZATION_ID routes its sends
  // through the Pancake provider (and only when it is configured).
  private shouldUsePancake(organizationId: string): boolean {
    const pancakeOrg = this.configService.get<string>('pancake.organizationId');
    return Boolean(
      pancakeOrg &&
      pancakeOrg === organizationId &&
      this.pancakeProvider.isConfigured(),
    );
  }

  private async sendViaProvider(
    organizationId: string,
    phone: string,
    content: string,
  ): Promise<ProviderSendResult> {
    if (this.shouldUsePancake(organizationId)) {
      const params = await this.resolvePancakeTemplateParams(
        organizationId,
        phone,
      );
      return this.pancakeProvider.sendTemplate(phone, params);
    }
    return this.provider.sendMessage(phone, content);
  }

  // Manual sends and advisor replies carry free text, but the Pancake path
  // sends through the approved template: resolve the named BODY_PARAMS from
  // the customer/organization (the product is unknown in these flows).
  private async resolvePancakeTemplateParams(
    organizationId: string,
    phone: string,
  ): Promise<Record<string, string>> {
    const [customer, organization] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { organizationId, phone, deletedAt: null },
        select: { name: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
    ]);
    return {
      customer_name: customer?.name ?? '',
      product_name: '',
      organization_name: organization?.name ?? '',
    };
  }

  private async findMessageUuidByProviderId(
    organizationId: string,
    providerMessageId: string,
  ): Promise<{ uuid: string; conversationId: string }> {
    const message = await this.prisma.message.findFirst({
      where: { organizationId, providerMessageId },
      select: { uuid: true, conversationId: true },
    });
    return {
      uuid: message?.uuid ?? '',
      conversationId: message?.conversationId ?? '',
    };
  }

  private toDate(timestamp: string): Date | null {
    if (!timestamp) {
      return null;
    }
    const numeric = Number(timestamp);
    if (!Number.isNaN(numeric)) {
      return new Date(numeric * 1000);
    }
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // ---------------------------------------------------------------------------
  // Idempotency-Key (API_GUIDELINES §19)
  // ---------------------------------------------------------------------------

  private idempotencyKey(user: AuthUser, key: string): string {
    return `${user.organizationId ?? 'platform'}:${key}`;
  }

  private resolveIdempotency(user: AuthUser, key: string): string | null {
    const entry = this.idempotencyStore.get(this.idempotencyKey(user, key));
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.idempotencyStore.delete(this.idempotencyKey(user, key));
      return null;
    }
    return entry.messageId;
  }

  private storeIdempotency(
    user: AuthUser,
    key: string,
    messageId: string,
  ): void {
    this.idempotencyStore.set(this.idempotencyKey(user, key), {
      messageId,
      expiresAt: Date.now() + this.IDEMPOTENCY_TTL_MS,
    });
  }

  private emit<T>(
    event: string,
    userId: string | null,
    organizationId: string,
    payload: T,
  ): void {
    this.eventEmitter.emit(
      event,
      buildWhatsappEvent<T>(
        EVENT_STATES[event],
        userId,
        organizationId,
        payload,
      ),
    );
  }
}

const EVENT_STATES: Record<
  string,
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RECEIVED'
  | 'OPEN'
  | 'EXECUTED'
> = {
  MessageQueued: 'QUEUED',
  MessageSent: 'SENT',
  MessageDelivered: 'DELIVERED',
  MessageRead: 'READ',
  MessageReceived: 'RECEIVED',
  MessageFailed: 'FAILED',
  ConversationOpened: 'OPEN',
  AutomationExecuted: 'EXECUTED',
  AutomationFailed: 'FAILED',
};

const STATUS_TRANSITIONS: Record<
  ProviderStatusUpdate['status'],
  { from: MessageStatus[] | MessageStatus; to: MessageStatus; event: string }
> = {
  SENT: {
    from: MessageStatus.QUEUED,
    to: MessageStatus.SENT,
    event: 'MessageSent',
  },
  DELIVERED: {
    from: MessageStatus.SENT,
    to: MessageStatus.DELIVERED,
    event: 'MessageDelivered',
  },
  READ: {
    from: MessageStatus.DELIVERED,
    to: MessageStatus.READ,
    event: 'MessageRead',
  },
  FAILED: {
    from: [MessageStatus.QUEUED, MessageStatus.SENT],
    to: MessageStatus.FAILED,
    event: 'MessageFailed',
  },
};

const MESSAGE_DETAIL_INCLUDE = {
  conversation: {
    select: {
      customer: { select: { uuid: true, name: true, phone: true } },
    },
  },
} as const;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

function toConversationSummary(
  conversation: Prisma.ConversationGetPayload<{
    include: typeof CONVERSATION_LIST_INCLUDE;
  }>,
): ConversationSummary {
  const messages = conversation.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  return {
    uuid: conversation.uuid,
    channel: conversation.channel,
    status: conversation.status,
    customerId: conversation.customerId,
    customer: conversation.customer
      ? {
          uuid: conversation.customer.uuid,
          name: conversation.customer.name,
          status: conversation.customer.status,
        }
      : null,
    advisorId: conversation.advisorId,
    advisor: conversation.advisor ?? null,
    tags: (conversation.tagAssignments ?? []).map((assignment) => ({
      uuid: assignment.tag.uuid,
      name: assignment.tag.name,
      color: assignment.tag.color,
    })),
    lastMessageAt: lastMessage ? lastMessage.createdAt.toISOString() : null,
    messageCount: messages.length,
    createdAt: conversation.createdAt.toISOString(),
  };
}

function toConversationDetail(
  conversation: ConversationWithDetail,
): ConversationDetail {
  return {
    ...toConversationSummary(conversation),
    messages: (conversation.messages ?? []).map(toMessageSummary),
    notes: (conversation.notes ?? []).map(toNoteSummary),
  };
}

function toNoteSummary(note: {
  uuid: string;
  content: string;
  createdAt: Date;
  author: { uuid: string; firstName: string; lastName: string };
}): ConversationNoteSummary {
  return {
    uuid: note.uuid,
    author: {
      uuid: note.author.uuid,
      firstName: note.author.firstName,
      lastName: note.author.lastName,
    },
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  };
}

function toMessageSummary(message: {
  uuid: string;
  conversationId: string | null;
  automationId: string | null;
  inReplyToCampaignId: string | null;
  inReplyToCampaignName?: string | null;
  type: MessageType;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}): MessageSummary {
  return {
    uuid: message.uuid,
    conversationId: message.conversationId,
    automationId: message.automationId,
    inReplyToCampaignId: message.inReplyToCampaignId,
    inReplyToCampaignName: message.inReplyToCampaignName ?? null,
    type: message.type,
    content: message.content,
    direction: message.direction,
    status: message.status,
    sentAt: message.sentAt ? message.sentAt.toISOString() : null,
    deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
    readAt: message.readAt ? message.readAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
  };
}

function toMessageDetail(
  message: Prisma.MessageGetPayload<{ include: typeof MESSAGE_DETAIL_INCLUDE }>,
): MessageDetail {
  return {
    ...toMessageSummary(message),
    customer: message.conversation?.customer ?? null,
  };
}
