import { randomUUID } from 'crypto';
import { ImportStatus } from '@prisma/client';

export interface ImportEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'imports';
  state: ImportStatus;
  payload: T;
}

export function buildImportEvent<T>(
  state: ImportStatus,
  userId: string | null,
  organizationId: string,
  payload: T,
): ImportEventEnvelope<T> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId,
    organizationId,
    module: 'imports',
    state,
    payload,
  };
}
