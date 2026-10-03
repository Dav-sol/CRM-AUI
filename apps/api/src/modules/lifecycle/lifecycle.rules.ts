/**
 * Fórmulas puras del lifecycle de postventa (spec 025). Sin I/O: cualquier
 * decisión que dependa solo de fechas vive aquí y se testea aislada.
 *
 * Regla estructural: la fecha base es SIEMPRE `installationDate`. Si no existe,
 * la función devuelve null y el gate G8 bloquea el envío (§1).
 */

export const MS_PER_DAY = 86_400_000;

/** Etapas cerradas cuyo plazo depende del ciclo, no del calendario. */
export type LifecycleMilestone =
  | 'REVIEW'
  | 'MAINTENANCE_1ST'
  | 'MAINTENANCE_2ND'
  | 'PRE_EXPIRY'
  | 'POST_EXPIRY_60'
  | 'POST_EXPIRY_90';

export type WarrantyMonths = 12 | 15 | 18 | 24;

/** §3: la reseña cae entre 2 y 5 días tras la instalación. */
export const REVIEW_MIN_DAYS = 2;
export const REVIEW_MAX_DAYS = 5;

/** §3: primer recordatorio de mantenimiento. */
export const MAINTENANCE_1ST_OFFSET_DAYS = 60;

/** §3: el segundo intento es 7 días después del primero. */
export const MAINTENANCE_2ND_OFFSET_DAYS = 7;

/** §3: máximo de intentos comerciales de mantenimiento. */
export const MAINTENANCE_MAX_ATTEMPTS = 2;

/** §9: primer contacto pre-vencimiento. */
export const PRE_EXPIRY_OFFSET_DAYS = 30;

/** §13 y §14: recuperación post-vencimiento. */
export const POST_EXPIRY_60_OFFSET_DAYS = 60;
export const POST_EXPIRY_90_OFFSET_DAYS = 90;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function diffInDays(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/**
 * Fecha base del lifecycle (§1). Devuelve null cuando no hay instalación:
 * el lifecycle no existe todavía y nada puede calcularse.
 */
export function baseDate(installationDate: Date | null): Date | null {
  return installationDate ?? null;
}

/**
 * Fin de garantía contado desde la INSTALACIÓN, no desde la venta (§1).
 * Si la garantía no está definida no hay ventana que comunicarle al cliente.
 */
export function warrantyEnd(
  installationDate: Date,
  warrantyMonths: number | null,
): Date | null {
  if (!warrantyMonths || warrantyMonths <= 0) {
    return null;
  }
  return addDays(installationDate, Math.round(warrantyMonths * 30.4375));
}

/**
 * Ventana de la reseña (§3): cualquier día dentro del rango es válido.
 * El día exacto dentro de la ventana depende de PD-10 y se decide fuera de
 * aquí: este módulo solo valida el rango.
 */
export function isWithinReviewWindow(
  installationDate: Date,
  at: Date,
): boolean {
  const days = diffInDays(at, installationDate);
  return days >= REVIEW_MIN_DAYS && days <= REVIEW_MAX_DAYS;
}

export function maintenanceFirstAttemptAt(installationDate: Date): Date {
  return addDays(installationDate, MAINTENANCE_1ST_OFFSET_DAYS);
}

export function maintenanceSecondAttemptAt(installationDate: Date): Date {
  return addDays(
    installationDate,
    MAINTENANCE_1ST_OFFSET_DAYS + MAINTENANCE_2ND_OFFSET_DAYS,
  );
}

/**
 * ¿Toca el siguiente intento de mantenimiento (§3)?
 * Tras el segundo intento sin interacción válida no hay más intentos.
 * Los fallos técnicos usan retryCount y no llegan aquí: este contador es de
 * intención de negocio.
 */
export function nextMaintenanceAttempt(
  attemptsMade: number,
): 'FIRST' | 'SECOND' | 'STOP' {
  if (attemptsMade < 1) return 'FIRST';
  if (attemptsMade < MAINTENANCE_MAX_ATTEMPTS) return 'SECOND';
  return 'STOP';
}

export function preExpiryAt(
  installationDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(installationDate, warrantyMonths);
  return end ? addDays(end, -PRE_EXPIRY_OFFSET_DAYS) : null;
}

export function postExpiry60At(
  installationDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(installationDate, warrantyMonths);
  return end ? addDays(end, POST_EXPIRY_60_OFFSET_DAYS) : null;
}

export function postExpiry90At(
  installationDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(installationDate, warrantyMonths);
  return end ? addDays(end, POST_EXPIRY_90_OFFSET_DAYS) : null;
}

/**
 * §5 prioridad entre comunicaciones concurrentes. Solo decide qué gana
 * cuando G3 impide enviar más de una; nunca permite saltarse el gate.
 *
 *   1. vencimiento de garantía
 *   2. mantenimiento preventivo consentido
 *   3. postventa / reseña / resto
 */
export type CommunicationCategory =
  'WARRANTY_EXPIRY' | 'MAINTENANCE_CONSENTED' | 'OTHER';

export const CATEGORY_PRIORITY: Record<CommunicationCategory, number> = {
  WARRANTY_EXPIRY: 1,
  MAINTENANCE_CONSENTED: 2,
  OTHER: 3,
};

export function winsCollision(
  candidate: CommunicationCategory,
  incumbent: CommunicationCategory,
): boolean {
  return CATEGORY_PRIORITY[candidate] < CATEGORY_PRIORITY[incumbent];
}

export function pickWinner(
  candidates: CommunicationCategory[],
): CommunicationCategory | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, current) =>
    CATEGORY_PRIORITY[current] < CATEGORY_PRIORITY[best] ? current : best,
  );
}

/** §4 G3: máximo 1 outbound AUTOMATIC por cliente cada 15 días. */
export const AUTOMATIC_FREQUENCY_DAYS = 15;

/**
 * `lastAutomaticSentAt <= now - 15d` bloquea; `> 15d` permite.
 * El día 16 es el primero elegible. `null` = nunca se envió.
 */
export function automaticFrequencyBlocks(
  lastAutomaticSentAt: Date | null,
  now: Date,
  days = AUTOMATIC_FREQUENCY_DAYS,
): boolean {
  if (!lastAutomaticSentAt) return false;
  return diffInDays(now, lastAutomaticSentAt) <= days;
}

/** §4.2 G4: 7 días de silencio desde el último MANUAL. */
export const MANUAL_SILENCE_DAYS = 7;

/**
 * MANUAL no consume el límite de G3 porque no es automático, pero sí activa
 * G4. `null` = nunca hubo mensaje manual.
 */
export function manualSilenceBlocks(
  lastManualSentAt: Date | null,
  now: Date,
  days = MANUAL_SILENCE_DAYS,
): boolean {
  if (!lastManualSentAt) return false;
  return diffInDays(now, lastManualSentAt) < days;
}

/** §4 §5: los 6 outcomes, cada uno con su transición. */
export const COMPLAINT_RESOLUTIONS = [
  'FALSE_ALARM',
  'TECHNICAL_ISSUE_RESOLVED',
  'BATTERY_REPLACED',
  'DEFECTIVE_PRODUCT_RETURNED',
  'DEFECTIVE_PRODUCT_REPLACED',
  'UNRESOLVED_NO_CONTACT',
] as const;

export type ComplaintResolutionValue = (typeof COMPLAINT_RESOLUTIONS)[number];

/**
 * Efecto sobre el lifecycle de cada outcome (§6.1).
 *
 *  - RESUME    reanuda desde el siguiente hito pendiente
 *  - FINISH    termina el lifecycle (el reemplazo genera uno nuevo)
 *  - CONTINUE  no termina; sigue según sus próximos hitos
 */
export type ResolutionEffect =
  | { kind: 'RESUME' }
  | { kind: 'FINISH'; terminationReason: string }
  | { kind: 'CONTINUE' };

export const RESOLUTION_EFFECTS: Record<
  ComplaintResolutionValue,
  ResolutionEffect
> = {
  FALSE_ALARM: { kind: 'RESUME' },
  TECHNICAL_ISSUE_RESOLVED: { kind: 'RESUME' },
  BATTERY_REPLACED: { kind: 'FINISH', terminationReason: 'BATTERY_REPLACED' },
  DEFECTIVE_PRODUCT_RETURNED: {
    kind: 'FINISH',
    terminationReason: 'DEFECTIVE_PRODUCT_RETURNED',
  },
  DEFECTIVE_PRODUCT_REPLACED: {
    kind: 'FINISH',
    terminationReason: 'DEFECTIVE_PRODUCT_REPLACED',
  },
  UNRESOLVED_NO_CONTACT: { kind: 'CONTINUE' },
};

/** Un outcome de reemplazo además de terminar deja lifecycle nuevo (§6.2). */
export function resolutionStartsNewCycle(
  resolution: ComplaintResolutionValue,
): boolean {
  return (
    resolution === 'BATTERY_REPLACED' ||
    resolution === 'DEFECTIVE_PRODUCT_REPLACED'
  );
}
