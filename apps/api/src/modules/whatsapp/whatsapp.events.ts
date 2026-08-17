import { randomUUID } from 'crypto';
import { MessageStatus } from '@prisma/client';

export interface WhatsappEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'whatsapp';
  state: MessageStatus | 'OPEN' | 'EXECUTED' | 'FAILED' | 'QUEUED' | 'RECEIVED';
  payload: T;
}

type WhatsappState = WhatsappEventEnvelope<never>['state'];

export function buildWhatsappEvent<T>(
  state: WhatsappState,
  userId: string | null,
  organizationId: string,
  payload: T,
): WhatsappEventEnvelope<T> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
    organizationId,
    module: 'whatsapp',
    state,
    payload,
  };
}

export interface MessageEventPayload {
  messageId: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: MessageStatus;
  content?: string;
}

export interface MessageSentPayload extends MessageEventPayload {
  sentAt: string;
}

export interface MessageStatusChangedPayload extends MessageEventPayload {
  changedAt: string;
}

export interface MessageReceivedPayload extends MessageEventPayload {
  receivedAt: string;
  from: string;
}

export interface MessageFailedPayload extends MessageEventPayload {
  failedAt: string;
  reason: string;
}

export interface ConversationOpenedPayload {
  conversationId: string;
  organizationId: string;
  channel: 'WHATSAPP_CLIENTS' | 'WHATSAPP_SOCIAL';
  customerId: string | null;
  openedAt: string;
  firstMessageId: string | null;
}

export interface AutomationExecutedPayload {
  automationId: string;
  purchaseId: string;
  messageId: string;
  executedAt: string;
  status: 'EXECUTED';
}

export interface AutomationFailedPayload {
  automationId: string;
  purchaseId: string;
  failedAt: string;
  reason: string;
}
