import { randomUUID } from 'crypto';
import { CampaignType } from '@prisma/client';

export interface CampaignCreatedPayload {
  campaignId: string;
  name: string;
  type: CampaignType;
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

export function buildCampaignCreatedEvent(
  campaignId: string,
  organizationId: string,
  name: string,
  type: CampaignType,
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
      name,
      type,
      status: 'DRAFT',
      createdAt: createdAt ?? new Date().toISOString(),
    },
  };
}

export function buildCampaignUpdatedEvent(
  campaignId: string,
  organizationId: string,
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

export function buildCampaignActivatedEvent(
  campaignId: string,
  organizationId: string,
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

export function buildCampaignFinishedEvent(
  campaignId: string,
  organizationId: string,
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

export function buildCampaignCancelledEvent(
  campaignId: string,
  organizationId: string,
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
