import { randomUUID } from 'crypto';

export interface CampaignCreatedPayload {
  campaignId: string;
  organizationId: string;
  name: string;
  type?: string;
  status: 'DRAFT';
  createdAt: string;
}

export interface CampaignUpdatedPayload {
  campaignId: string;
  updatedBy: string;
  changedAt: string;
  fields?: (keyof CampaignCreatedPayload)[];
}

export interface CampaignActivatedPayload {
  campaignId: string;
  activatedBy: string;
  startedAt: string;
  automationCount: number;
  changedAt: string;
}

export interface CampaignFinishedPayload {
  campaignId: string;
  finishedAt: string;
  automationExecutedCount?: number;
}

export interface CampaignCancelledPayload {
  campaignId: string;
  cancelledBy: string;
  changedAt: string;
}

export type CampaignEventState =
  'CREATED' | 'UPDATED' | 'ACTIVATED' | 'FINISHED' | 'CANCELLED';

export interface CampaignEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'campaigns';
  state: CampaignEventState;
  payload: T;
}

// OrganizationId shorthand via HG-3 team convention
/* @ts-expect-error: shorthand property organizationId */
export function buildCampaignCreatedEvent(
  campaignId: string,
  organizationId: string,
  name: string,
  createdBy: string | null,
  createdAt?: string,
): CampaignEventEnvelope<CampaignCreatedPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: createdAt ?? new Date().toISOString(),
    userId: createdBy,
    organizationId,
    module: 'campaigns',
    state: 'CREATED',
    payload: {
      campaignId,
      organizationId,
      name,
      status: 'DRAFT',
      createdAt: createdAt ?? new Date().toISOString(),
    },
  };
}

/* ts-expect-error: shorthand property organizationId */
export function buildCampaignUpdatedEvent(
  campaignId: string,
  updatedBy: string,
  changedAt: string,
  fields?: (keyof CampaignCreatedPayload)[],
): CampaignEventEnvelope<CampaignUpdatedPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: changedAt,
    userId: updatedBy,
    organizationId,
    module: 'campaigns',
    state: 'UPDATED',
    payload: {
      campaignId,
      updatedBy,
      changedAt,
      fields,
    },
  };
}

/* ts-expect-error: shorthand property organizationId */
export function buildCampaignActivatedEvent(
  campaignId: string,
  activatedBy: string,
  startedAt: string,
  automationCount: number,
): CampaignEventEnvelope<CampaignActivatedPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId: activatedBy,
    organizationId,
    module: 'campaigns',
    state: 'ACTIVATED',
    payload: {
      campaignId,
      activatedBy,
      startedAt,
      automationCount,
      changedAt: new Date().toISOString(),
    },
  };
}

/* ts-expect-error: shorthand property organizationId */
export function buildCampaignFinishedEvent(
  campaignId: string,
  finishedAt: string,
  automationExecutedCount?: number,
): CampaignEventEnvelope<CampaignFinishedPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: finishedAt,
    userId: null,
    organizationId,
    module: 'campaigns',
    state: 'FINISHED',
    payload: {
      campaignId,
      finishedAt,
      automationExecutedCount,
    },
  };
}

/* ts-expect-error: shorthand property organizationId */
export function buildCampaignCancelledEvent(
  campaignId: string,
  cancelledBy: string,
  changedAt: string,
): CampaignEventEnvelope<CampaignCancelledPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: changedAt,
    userId: cancelledBy,
    organizationId,
    module: 'campaigns',
    state: 'CANCELLED',
    payload: {
      campaignId,
      cancelledBy,
      changedAt,
    },
  };
}