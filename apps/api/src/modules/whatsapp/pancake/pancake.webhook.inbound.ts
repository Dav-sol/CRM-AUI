import type { ProviderInboundMessage } from '../whatsapp.provider';
import type { PancakeMessage } from './pancake.types';

/**
 * PAN-03 · adaptador de EVENTOS de webhook de Pancake (contrato puro).
 *
 * Fuente: `https://developer.pancake.biz/openapi/webhook.yaml` (v1.0.0).
 * Es un contrato distinto del de lectura (`pancake.inbound.ts`, que traduce la
 * respuesta de `GET …/messages`): aquí la entrada es el cuerpo que Pancake
 * envía por POST.
 *
 * Este módulo es **puro**: no hay I/O, ni red, ni credenciales, ni reloj
 * distinto del inyectado. Traduce y decide; no persiste ni envía nada.
 *
 * AUTENTICIDAD — PENDIENTE, NO RESUELTA
 * -------------------------------------
 * El contrato oficial de Pancake **no documenta firma, HMAC ni cabecera de
 * autenticación**. Por tanto este adaptador **no autentica** al emisor y no
 * debe usarse para aceptar eventos que modifiquen datos sin antes decidir cómo
 * se valida el origen. HTTPS **no** autentica por sí solo al emisor: cualquiera
 * que conozca la URL puede hacer un POST. La decisión (allowlist de `page_id`,
 * ruta secreta, mTLS u otra) queda **pendiente** y fuera de este módulo.
 *
 * ESTADOS DE ENTREGA — NO EXISTEN
 * -------------------------------
 * El esquema oficial de `Message` en el webhook no publica `SENT`,
 * `DELIVERED`, `READ` ni `FAILED`. Este adaptador **no inventa** ninguno: la
 * salida es `ProviderInboundMessage`, que no tiene campo de estado.
 */

/**
 * Motivo por el que un evento no produce mensaje entrante.
 *
 * `UNKNOWN_EVENT` agrupa los cuatro eventos que no son `messaging`
 * (`conversation`, `subscription`, `post`, `connect_status`): son válidos en el
 * contrato, pero no aportan mensajes a este adaptador.
 */
export type PancakeWebhookSkipReason =
  /** `is_removed: true` — el mensaje ya no existe en el inbox. */
  | 'REMOVED'
  /** `type: COMMENT` — comentario de publicación, no mensaje de inbox. */
  | 'COMMENT'
  /** Escrito por un asesor (`from.uid` / `from.admin_id`). */
  | 'STAFF'
  /** Sin `from.id` (PSID) no hay emisor. */
  | 'NO_SENDER'
  /** Sin `id` no hay clave de idempotencia. */
  | 'NO_PROVIDER_ID'
  /** El PSID no tiene un único teléfono asociado. */
  | 'NO_PHONE'
  /** El evento no es `messaging`, no trae `message`, o no es JSON reconocible. */
  | 'UNKNOWN_EVENT';

export interface PancakeWebhookSkipped {
  providerMessageId: string | null;
  conversationId: string | null;
  reason: PancakeWebhookSkipReason;
}

/**
 * Sobre que Pancake envía por POST. Todos los campos son opcionales porque el
 * cuerpo llega sin validar: cualquier cosa puede estar ausente o mal tipada.
 */
export interface PancakeWebhookEnvelope {
  page_id?: string;
  event_type?: string;
  data?: {
    conversation?: { id?: string; type?: string };
    message?: PancakeMessage;
    post?: unknown;
  } | null;
}

export interface MapPancakeWebhookOptions {
  /**
   * Índice `psid → teléfono` construido por `buildPhoneIndex` a partir de
   * `page_customers`. Sin él, todo mensaje cae en `NO_PHONE`: el sobre del
   * webhook **no** trae el teléfono canónico (solo `has_phone` y
   * `phone_info`, que describen el contenido, no al emisor).
   */
  phoneByPsid: ReadonlyMap<string, string>;
  /**
   * Instante usado cuando el evento no trae `inserted_at`. Se inyecta para que
   * la función siga siendo determinista en pruebas.
   */
  now?: Date;
}

export interface MapPancakeWebhookResult {
  eventType: string | null;
  pageId: string | null;
  messages: ProviderInboundMessage[];
  skipped: PancakeWebhookSkipped[];
}

/**
 * Traduce un evento de Pancake al contrato interno de entrada.
 *
 * Orden de decisión (el primero que aplica gana):
 *  1. `event_type !== 'messaging'` → `UNKNOWN_EVENT`
 *  2. sin `data.message` → `UNKNOWN_EVENT`
 *  3. `type === 'COMMENT'` (mensaje o conversación) → `COMMENT`
 *  4. `is_removed === true` → `REMOVED`
 *  5. sin `id` → `NO_PROVIDER_ID`
 *  6. sin `from.id` → `NO_SENDER`
 *  7. `from.uid` / `from.admin_id` → `STAFF`
 *  8. PSID sin teléfono único → `NO_PHONE`
 *
 * El evento trae **un único** `data.message`. Pancake documenta reentregas del
 * mismo evento, así que la idempotencia no se resuelve aquí: la clave es
 * `providerMessageId` y la aplica HG-13 al persistir.
 *
 * El texto persistido es `original_message` (sin renderizar); `message` puede
 * contener HTML (los mensajes solo-imagen llegan como `<div></div>`).
 */
export function mapPancakeWebhookEvent(
  envelope: PancakeWebhookEnvelope | null | undefined,
  options: MapPancakeWebhookOptions,
): MapPancakeWebhookResult {
  const eventType =
    typeof envelope?.event_type === 'string' ? envelope.event_type : null;
  const pageId =
    typeof envelope?.page_id === 'string' ? envelope.page_id : null;
  const skipped: PancakeWebhookSkipped[] = [];
  const messages: ProviderInboundMessage[] = [];

  const message = envelope?.data?.message;
  const conversationId = message?.conversation_id ?? null;

  if (eventType !== 'messaging') {
    skipped.push({
      providerMessageId: message?.id ?? null,
      conversationId,
      reason: 'UNKNOWN_EVENT',
    });
    return { eventType, pageId, messages, skipped };
  }

  if (!message || typeof message !== 'object') {
    skipped.push({
      providerMessageId: null,
      conversationId: null,
      reason: 'UNKNOWN_EVENT',
    });
    return { eventType, pageId, messages, skipped };
  }

  if (
    message.type === 'COMMENT' ||
    envelope?.data?.conversation?.type === 'COMMENT'
  ) {
    skipped.push({
      providerMessageId: message.id ?? null,
      conversationId,
      reason: 'COMMENT',
    });
    return { eventType, pageId, messages, skipped };
  }

  if (message.is_removed === true) {
    skipped.push({
      providerMessageId: message.id ?? null,
      conversationId,
      reason: 'REMOVED',
    });
    return { eventType, pageId, messages, skipped };
  }

  if (!message.id) {
    skipped.push({
      providerMessageId: null,
      conversationId,
      reason: 'NO_PROVIDER_ID',
    });
    return { eventType, pageId, messages, skipped };
  }

  const psid = message.from?.id;
  if (!psid) {
    skipped.push({
      providerMessageId: message.id,
      conversationId,
      reason: 'NO_SENDER',
    });
    return { eventType, pageId, messages, skipped };
  }

  if (message.from?.uid || message.from?.admin_id) {
    skipped.push({
      providerMessageId: message.id,
      conversationId,
      reason: 'STAFF',
    });
    return { eventType, pageId, messages, skipped };
  }

  const phone = options.phoneByPsid.get(psid);
  if (!phone) {
    skipped.push({
      providerMessageId: message.id,
      conversationId,
      reason: 'NO_PHONE',
    });
    return { eventType, pageId, messages, skipped };
  }

  messages.push({
    providerMessageId: message.id,
    from: phone,
    text: message.original_message ?? message.message ?? '',
    timestamp: message.inserted_at ?? (options.now ?? new Date()).toISOString(),
    providerConversationId:
      message.conversation_id ?? envelope?.data?.conversation?.id ?? null,
  });

  return { eventType, pageId, messages, skipped };
}
