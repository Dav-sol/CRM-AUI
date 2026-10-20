/**
 * Política de autorización de envíos salientes (AUTO-SAFETY-002).
 *
 * Fail-closed: ante la ausencia, el vacío, un valor malformado o un error al
 * leer la configuración, la decisión es SIEMPRE denegar. Un permiso se concede
 * solo cuando las cuatro condiciones se cumplen de forma explícita:
 *
 *   1. interruptor global exactamente `ENABLED`
 *   2. organización en una allowlist explícita y no vacía
 *   3. canal en una allowlist explícita y no vacía
 *   4. autorización temporal presente, válida y no vencida
 *
 * No se interpretan valores truthy: `"true"`, `"1"`, `"yes"` o `"ENABLED "`
 * deniegan igual que `undefined`. La comparación es exacta y sin trim.
 *
 * Este módulo es puro (sin I/O) para poder testearse aislado.
 */

/** Versión de la política: cambia si cambia la semántica del permiso. */
export const SEND_PERMIT_POLICY_VERSION = 'v1';

/** Único valor que habilita el interruptor global. */
export const SEND_PERMIT_ENABLED_TOKEN = 'ENABLED';

/** Único valor explícito de denegación. */
export const SEND_PERMIT_DENIED_TOKEN = 'DENIED';

export const OUTBOUND_CHANNELS = ['WHATSAPP', 'SMS'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

/**
 * Motivos de denegación. Se registran en auditoría; nunca contienen
 * credenciales ni datos personales.
 */
export const SEND_PERMIT_DENIAL_REASONS = [
  'CONFIG_ERROR',
  'SWITCH_MISSING',
  'SWITCH_DENIED',
  'ORG_MISSING',
  'ORG_NOT_ALLOWED',
  'CHANNEL_NOT_ALLOWED',
  'WINDOW_MISSING',
  'WINDOW_INVALID',
  'WINDOW_EXPIRED',
] as const;
export type SendPermitDenialReason =
  (typeof SEND_PERMIT_DENIAL_REASONS)[number];

/** Configuración cruda, tal y como llega del entorno. Sin normalizar. */
export interface SendPermitPolicy {
  /** Valor crudo de `OUTBOUND_SEND_ENABLED`. Sin truthiness. */
  enabled: string | undefined;
  /** IDs de organización autorizados. Vacío = nadie autorizado. */
  allowedOrganizations: readonly string[];
  /** Canales autorizados. Vacío = ningún canal. */
  allowedChannels: readonly string[];
  /** Instante de expiración ISO-8601. Ausente = la ventana no existe. */
  until: string | undefined;
}

export interface SendPermitDecision {
  allowed: boolean;
  reason?: SendPermitDenialReason;
}

const ALLOW: SendPermitDecision = { allowed: true };

function deny(reason: SendPermitDenialReason): SendPermitDecision {
  return { allowed: false, reason };
}

/**
 * Divide un CSV de entorno. No aplica `trim`: un ID con espacios distintos al
 * real no coincide con la allowlist y por tanto deniega. Fail-closed.
 */
export function parseCsvList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Evalúa la política. Función pura: mismo input → misma decisión.
 *
 * El orden importa: se comprueba primero el interruptor global para que el
 * motivo registrado sea el más informativo y no dependa del resto.
 */
export function evaluateSendPermit(
  policy: SendPermitPolicy,
  organizationId: string | null | undefined,
  channel: OutboundChannel,
  now: Date = new Date(),
): SendPermitDecision {
  // 1. Interruptor global. Ausente o distinto de ENABLED (DENIED incluido)
  //    deniega. No hay truthiness en ningún punto.
  if (policy.enabled === undefined || policy.enabled === null) {
    return deny('SWITCH_MISSING');
  }
  if (policy.enabled !== SEND_PERMIT_ENABLED_TOKEN) {
    return deny('SWITCH_DENIED');
  }

  // 2. Organización en allowlist explícita.
  if (!organizationId) {
    return deny('ORG_MISSING');
  }
  if (!policy.allowedOrganizations.includes(organizationId)) {
    return deny('ORG_NOT_ALLOWED');
  }

  // 3. Canal autorizado.
  if (
    !policy.allowedChannels.includes(channel) ||
    !(OUTBOUND_CHANNELS as readonly string[]).includes(channel)
  ) {
    return deny('CHANNEL_NOT_ALLOWED');
  }

  // 4. Ventana temporal obligatoria: ausente, inválida o vencida deniega.
  if (!policy.until) {
    return deny('WINDOW_MISSING');
  }
  const expiry = new Date(policy.until);
  if (Number.isNaN(expiry.getTime())) {
    return deny('WINDOW_INVALID');
  }
  if (expiry.getTime() <= now.getTime()) {
    return deny('WINDOW_EXPIRED');
  }

  return ALLOW;
}

/**
 * Bloqueo por política de seguridad. NO es un fallo del proveedor: los
 * llamadores deben tratarlo distinto (no consumir reintentos, no marcar la
 * automatización como ejecutada).
 */
export class SendBlockedError extends Error {
  readonly denialReason: SendPermitDenialReason;
  readonly channel: OutboundChannel;

  constructor(reason: SendPermitDenialReason, channel: OutboundChannel) {
    super(`outbound send blocked by policy (${reason})`);
    this.name = 'SendBlockedError';
    this.denialReason = reason;
    this.channel = channel;
  }
}
