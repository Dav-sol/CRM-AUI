import { randomUUID } from 'crypto';
import { AutomationStatus, CommercialCycleStatus } from '@prisma/client';

export interface AutomationEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'automations';
  state: 'CREATED' | 'CANCELLED' | 'STARTED';
  payload: T;
}

type AutomationState = AutomationEventEnvelope<never>['state'];

export function buildAutomationEvent<T>(
  state: AutomationState,
  userId: string | null,
  organizationId: string,
  payload: T,
): AutomationEventEnvelope<T> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
    organizationId,
    module: 'automations',
    state,
    payload,
  };
}

export interface CycleEventPayload {
  cycleId: string;
  purchaseId: string;
  status: CommercialCycleStatus;
  startDate: string;
}

export interface AutomationEventPayload {
  automationId: string;
  purchaseId: string;
  commercialCycleId: string;
  status: AutomationStatus;
  scheduledDate: string;
}

export interface AutomationCancelledPayload extends AutomationEventPayload {
  cancelledAt: string;
}

export interface CycleCancelledPayload extends CycleEventPayload {
  endDate: string;
}
