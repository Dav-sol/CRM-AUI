import type { ProviderInboundMessage } from '../whatsapp.provider';
import type { PancakeMessage, PancakePageCustomer } from './pancake.types';

/**
 * PAN-02 · contrato de ENTRADA desde Pancake Public API.
 *
 * Pancake no publica ningún webhook (cero apariciones de «webhook» en
 * `specs/API-Pancake/document.md`), así que la única vía documentada de
 * recepción es la lectura:
 *
 *   GET /pages/{page_id}/conversations/{conversation_id}/messages
 *
 * Este módulo traduce esa respuesta al contrato interno agnóstico al
 * proveedor (`ProviderInboundMessage`, el mismo que consume
 * `WhatsappService.handleInboundPayload`), que ya aporta la idempotencia
 * HG-13 en el extremo servidor.
 *
 * Es **puro**: no hay I/O, no hay red y no hay envíos. Todo se decide sobre
 * payloads documentados, cubiertos en `pancake.inbound.spec.ts`.
 *
 * Límite deliberado: aquí NO se decide si hay que implementar sondeo ni con
 * qué periodicidad. Eso es una decisión de arquitectura pendiente de David.
 */

/** Motivo por el que un mensaje de Pancake no se ingiere. Solo describe contrato. */
export type PancakeInboundSkipReason =
  /** `is_removed: true` — el mensaje ya no existe en el inbox. */
  | 'REMOVED'
  /** Escrito por un asesor: no es una entrada del cliente. */
  | 'STAFF'
  /** Sin `from.id` (PSID) no hay emisor. */
  | 'NO_SENDER'
  /** Sin `id` no hay clave de idempotencia. */
  | 'NO_PROVIDER_ID'
  /**
   * El PSID no tiene un único teléfono asociado. `Conversation` solo declara
   * `has_phone`; el teléfono canónico vive en `page_customers`, y si hay
   * varios —o ninguno— **no se elige ninguno**: el contrato interno de entrada
   * está definido sobre un teléfono y adivinarlo corrompería el hilo.
   */
  | 'NO_PHONE';

export interface PancakeInboundSkipped {
  providerMessageId: string | null;
  conversationId: string | null;
  reason: PancakeInboundSkipReason;
}

export interface MapPancakeInboundResult {
  /** Mensajes del cliente listos para `handleInboundPayload`. */
  messages: ProviderInboundMessage[];
  /** Descartes, con su motivo, para diagnóstico. */
  skipped: PancakeInboundSkipped[];
  /** IDs repetidos dentro del propio lote. */
  duplicates: string[];
}

export interface MapPancakeInboundOptions {
  /** `psid -> teléfono`, obtenido con `buildPhoneIndex`. */
  phoneByPsid: ReadonlyMap<string, string>;
  /** Conversación del lote, si los mensajes no traen `conversation_id`. */
  conversationId?: string | null;
}

/**
 * Índice `psid -> teléfono` a partir de `GET /pages/{page_id}/page_customers`.
 *
 * Regla: solo se indexa un PSID con **exactamente un** teléfono. Con varios se
 * declara `ambiguous` y no se indexa (nada de coger el primero); con ninguno
 * queda en `withoutPhone`.
 */
export interface PancakePhoneIndex {
  phoneByPsid: ReadonlyMap<string, string>;
  withoutPhone: string[];
  ambiguous: Array<{ psid: string; phoneCount: number }>;
}

export function buildPhoneIndex(
  customers: readonly PancakePageCustomer[] | undefined,
): PancakePhoneIndex {
  const phoneByPsid = new Map<string, string>();
  const withoutPhone: string[] = [];
  const ambiguous: Array<{ psid: string; phoneCount: number }> = [];

  for (const customer of customers ?? []) {
    const psid = customer.psid;
    if (!psid) {
      continue;
    }
    const phones = (customer.phone_numbers ?? []).filter(
      (phone): phone is string => typeof phone === 'string' && phone.length > 0,
    );
    if (phones.length === 1) {
      phoneByPsid.set(psid, phones[0]);
    } else if (phones.length === 0) {
      withoutPhone.push(psid);
    } else {
      ambiguous.push({ psid, phoneCount: phones.length });
    }
  }

  return { phoneByPsid, withoutPhone, ambiguous };
}

/**
 * Traduce un lote de mensajes de Pancake al contrato interno de entrada.
 *
 * Criterios, todos derivados del esquema publicado (`document.md:3848`):
 *  - `from.admin_id` / `from.uid` documentan «sent by a staff member», así que
 *    un mensaje con esos campos **no** es una entrada del cliente y se descarta
 *    en lugar de atribuirse a la conversación equivocada.
 *  - El texto persistido es `original_message` (sin renderizar); `message`
 *    puede contener HTML (`<div></div>` en mensajes solo-imagen).
 *  - Un lote puede repetir IDs: se colapsan antes de llegar a HG-13.
 *  - `timestamp` cae a la hora actual solo si la API no lo trae, igual que hace
 *    `MetaWhatsAppProvider.parseInbound`.
 */
export function mapPancakeInbound(
  messages: readonly PancakeMessage[] | undefined,
  options: MapPancakeInboundOptions,
): MapPancakeInboundResult {
  const mapped: ProviderInboundMessage[] = [];
  const skipped: PancakeInboundSkipped[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const message of messages ?? []) {
    const conversationId =
      message.conversation_id ?? options.conversationId ?? null;

    if (message.is_removed === true) {
      skipped.push({
        providerMessageId: message.id,
        conversationId,
        reason: 'REMOVED',
      });
      continue;
    }
    if (!message.id) {
      skipped.push({
        providerMessageId: null,
        conversationId,
        reason: 'NO_PROVIDER_ID',
      });
      continue;
    }
    if (seen.has(message.id)) {
      duplicates.push(message.id);
      continue;
    }

    const psid = message.from?.id;
    if (!psid) {
      skipped.push({
        providerMessageId: message.id,
        conversationId,
        reason: 'NO_SENDER',
      });
      continue;
    }
    if (message.from?.admin_id || message.from?.uid) {
      skipped.push({
        providerMessageId: message.id,
        conversationId,
        reason: 'STAFF',
      });
      continue;
    }

    const phone = options.phoneByPsid.get(psid);
    if (!phone) {
      skipped.push({
        providerMessageId: message.id,
        conversationId,
        reason: 'NO_PHONE',
      });
      continue;
    }

    seen.add(message.id);
    mapped.push({
      providerMessageId: message.id,
      from: phone,
      text: message.original_message ?? message.message ?? '',
      timestamp: message.inserted_at ?? new Date().toISOString(),
      providerConversationId: conversationId,
    });
  }

  return { messages: mapped, skipped, duplicates };
}
