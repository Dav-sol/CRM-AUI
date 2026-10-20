import { randomUUID } from 'crypto';

export interface ConfigEventEnvelope<T> {
  eventId: string;
  occurredAt: string;
  userId: string | null;
  organizationId: string;
  module: 'configuraciones';
  state: 'UPDATED';
  payload: T;
}

export type ConfigEventState = ConfigEventEnvelope<never>['state'];

export interface ConfigEventPayload {
  section: 'horarios' | 'parametros';
  keys: string[];
}

export function buildConfigUpdatedEvent(
  section: ConfigEventPayload['section'],
  keys: string[],
  userId?: string | null,
  organizationId?: string,
): ConfigEventEnvelope<ConfigEventPayload> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    userId: userId ?? null,
    organizationId: organizationId ?? '',
    module: 'configuraciones',
    state: 'UPDATED',
    payload: { section, keys },
  };
}
