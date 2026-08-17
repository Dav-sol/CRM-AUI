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
  ProviderStatusUpdate,
  WhatsAppProvider,
} from './whatsapp.provider';
import { ProviderSendError, WHATSAPP_PROVIDER } from './whatsapp.provider';

const MODULE = 'whatsapp';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CONVERSATION_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'status']);
const MESSAGE_SORT_FIELDS = new Set(['createdAt', 'sentAt', 'status']);

const SCHEDULER_BATCH_SIZE = 100;

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
  conversationId: string;
  automationId: string | null;
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
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Automatic execution (Flujo 05, US1)
  // ---------------------------------------------------------------------------

  async executeDueAutomations(): Promise<void> {
    const due = await this.prisma.automation.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledDate: { lte: new Date() },
        deletedAt: null,
        purchase: {
          deletedAt: null,
          customer: { deletedAt: null, status: 'ACTIVE' },
        },
      },
      include: {
        purchase: {
          include: {
            customer: true,
            product: { select: { name: true } },
          },
        },
        organization: { select: { name: true } },
      },
      orderBy: { scheduledDate: 'asc' },
      take: SCHEDULER_BATCH_SIZE,
    });

    for (const automation of due) {
      await this.executeOneAutomation(automation);
    }
  }

  private async executeOneAutomation(automation: {
    id: string;
    uuid: string;
    organizationId: string;
    purchaseId: string;
    scheduledDate: Date;
    purchase: {
      customer: {
        id: string;
        uuid: string;
        phone: string | null;
        name: string;
        status: CustomerStatus;
      };
      product: { name: string } | null;
    };
    organization: { name: string } | null;
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
        const updated = await tx.automation.updateMany({
          where: { id: automation.id, status: 'SCHEDULED' },
          data: {
            status: 'EXECUTED',
            executedDate: new Date(),
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

    try {
      const sendResult = await this.provider.sendMessage(phone, content);
      await this.markSent(message, automation.organizationId, sendResult);
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
        metadata: { automationId: automation.uuid, messageId: message.uuid },
      });
    } catch (error) {
      const reason =
        error instanceof ProviderSendError
          ? 'provider_error'
          : 'internal_error';
      await this.failMessage(message, automation.organizationId, reason);
      this.emit('AutomationFailed', null, automation.organizationId, {
        automationId: automation.uuid,
        purchaseId: automation.purchaseId,
        failedAt: new Date().toISOString(),
        reason,
      } satisfies AutomationFailedPayload);
      await this.auditService.record({
        module: MODULE,
        action: 'automation.failed',
        outcome: 'failure',
        userId: null,
        organizationId: automation.organizationId,
        description: `automatic execution failed automation=${automation.uuid}`,
        metadata: { automationId: automation.uuid, reason },
      });
    }
  }

  private buildAutomaticContent(automation: {
    purchase: {
      customer: { name: string };
      product: { name: string } | null;
    };
    organization: { name: string } | null;
  }): string {
    return AUTOMATIC_TEMPLATE.replace(
      '{customerName}',
      automation.purchase.customer.name,
    )
      .replace('{productName}', automation.purchase.product?.name ?? '')
      .replace('{organizationName}', automation.organization?.name ?? '');
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
      const sendResult = await this.provider.sendMessage(phone, dto.content);
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
      const reason =
        error instanceof ProviderSendError
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
          code: 'CUSTOMER_NO_PHONE',
          message: 'Customer has no phone number',
        },
      });
    }

    try {
      const sendResult = await this.provider.sendMessage(phone, content);
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
      const reason =
        error instanceof ProviderSendError
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

    const customer = await this.findCustomerByPhone(organizationId, phone);
    let conversation: { id: string; uuid: string; alreadyOpen: boolean };

    try {
      conversation = await this.prisma.$transaction(async (tx) => {
        const existingConversation = customer
          ? await this.findOpenCustomerConversation(
              tx,
              organizationId,
              customer.id,
              ChannelType.WHATSAPP_CLIENTS,
            )
          : await this.findOpenPendingConversation(
              tx,
              organizationId,
              message.providerConversationId,
            );
        if (existingConversation) {
          return { ...existingConversation, alreadyOpen: true };
        }
        const created = await tx.conversation.create({
          data: {
            organizationId,
            customerId: customer?.id ?? null,
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
          customerId: customer?.uuid ?? null,
        },
      });
      this.emit('ConversationOpened', null, organizationId, {
        conversationId: conversation.uuid,
        organizationId,
        channel: ChannelType.WHATSAPP_CLIENTS,
        customerId: customer?.uuid ?? null,
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
    return toConversationDetail(conversation);
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

  private async findCustomerByPhone(
    organizationId: string,
    phone: string,
  ): Promise<{ id: string; uuid: string; organizationId: string } | null> {
    const normalized = normalizePhone(phone);
    const customers = await this.prisma.customer.findMany({
      where: {
        organizationId,
        status: CustomerStatus.ACTIVE,
        deletedAt: null,
        phone: { not: null },
      },
      select: { id: true, uuid: true, organizationId: true, phone: true },
      take: 20,
    });
    const match = customers.find(
      (customer) =>
        customer.phone && normalizePhone(customer.phone) === normalized,
    );
    return match
      ? { id: match.id, uuid: match.uuid, organizationId: match.organizationId }
      : null;
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

  private findOpenPendingConversation(
    tx: PrismaClient,
    organizationId: string,
    providerConversationId: string | null,
  ): Promise<{ id: string; uuid: string } | null> {
    return tx.conversation.findFirst({
      where: {
        organizationId,
        customerId: null,
        channel: ChannelType.WHATSAPP_CLIENTS,
        status: ConversationStatus.OPEN,
        deletedAt: null,
        ...(providerConversationId
          ? {
              messages: {
                some: {
                  providerConversationId,
                  direction: MessageDirection.INBOUND,
                  deletedAt: null,
                },
              },
            }
          : {}),
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
  conversationId: string;
  automationId: string | null;
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
