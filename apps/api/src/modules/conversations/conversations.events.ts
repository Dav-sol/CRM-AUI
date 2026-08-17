import { randomUUID } from 'crypto';

export type ConversationsEventState =
  'ASSIGNED' | 'TRANSFERRED' | 'CLOSED' | 'ARCHIVED';

export interface ConversationsEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'conversations';
  state: ConversationsEventState;
  payload: T;
}

export function buildConversationsEvent<T>(
  state: ConversationsEventState,
  userId: string | null,
  organizationId: string,
  payload: T,
): ConversationsEventEnvelope<T> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
    organizationId,
    module: 'conversations',
    state,
    payload,
  };
}

export interface ConversationAssignedPayload {
  conversationId: string;
  advisorId: string;
  assignedBy: string;
  assignedAt: string;
}

export interface ConversationTransferredPayload {
  conversationId: string;
  fromAdvisorId: string | null;
  toAdvisorId: string;
  transferredBy: string;
  transferredAt: string;
}

export interface ConversationClosedPayload {
  conversationId: string;
  closedBy: string;
  changedAt: string;
}

export interface ConversationArchivedPayload {
  conversationId: string;
  archivedBy: string;
  changedAt: string;
}
