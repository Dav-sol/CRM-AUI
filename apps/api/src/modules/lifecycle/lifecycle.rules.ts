/**
 * Fórmulas puras del lifecycle de postventa. Sin I/O: cualquier decisión que
 * dependa solo de fechas vive aquí y se testea aislada.
 *
 * ══ CONTRATO CANÓNICO DE LA FUENTE DE VERDAD TEMPORAL ══
 *
 * El PIT (`specs/026-pit-final/pit.md`) es la autoridad funcional. Las fechas
 * comerciales son DÍAS CIVILES de `America/Bogota`, persistidos como `DATE`.
 *
 * Hay DOS bases distintas y confundirlas es el error que este módulo previene:
 *
 * 1. **Fecha de COMPRA (`purchaseDate`)** — base de la GARANTÍA. Es la base de
 *    todo lo derivado del vencimiento: el propio vencimiento, el preaviso de
 *    caducidad (RF-07) y la secuencia de retención (RF-06). No puede
 *    sustituirse por la instalación (decisión D-1).
 *
 * 2. **Fecha de INSTALACIÓN (`installationDate`)** — dato del proceso de
 *    montaje. Ya NO es base de nada ni requisito de elegibilidad: solo se
 *    conserva como información de la compra.
 *
 * Reglas que se aplican sin excepción:
 * - **Vencimiento** = `addMonthsClamped(purchaseDate, warrantyMonths)`
 *   (P1.8: meses de calendario, conservando el día y ajustando al último día
 *   válido del mes destino cuando el día no existe).
 * - `warrantyMonths` nulo o ≤ 0 ⇒ **no hay vencimiento**; se devuelve `null`
 *   y las etapas derivadas no se planifican. Nunca se inventa una fecha.
 * - Las etapas derivadas del vencimiento heredan la base de COMPRA, no la del
 *   ciclo.
 * - Toda aritmética se hace sobre los campos **UTC** del instante. Una fecha
 *   civil no tiene zona: aplicarle la de una organización la desplazaría un
 *   día (RNF-07).
 *
 * DECISIONES HUMANAS APLICADAS (ya resueltas, no reabiertas):
 * - `commercial_cycles.start_date` representa la FECHA DE COMPRA del ERP.
 * - Una compra entra al lifecycle con fecha de compra válida, aunque no tenga
 *   fecha de instalación: la instalación es un dato del montaje, no un requisito
 *   de elegibilidad, y el gate G8 evalúa la base canónica del ciclo.
 * - Los plazos de etapas sin respaldo en el PIT (+3d, +60d/+67d de
 *   mantenimiento, +6m/+12m de seguimiento) quedan FUERA de la lógica activa:
 *   procedían de un `spec-025` vacío. No se sustituyen por otros inventados.
 *
 * ETAPAS VIGENTES (las únicas que programa el ciclo comercial):
 *   RF-03 revisiones bimensuales · RF-07 preaviso −30d · RF-06 retención +60d,
 *   +90d, +6m, +12m, +18m. Ver `lifecycle-milestones.planMilestones`.
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
 * Suma de meses calendario con ajuste al último día válido (PIT §2.1, P1.8).
 *
 * Contrato:
 * - Se conserva el día del mes cuando existe en el mes de destino.
 * - Si el día no existe en el mes de destino, se ajusta al último día de ese
 *   mes (31-ene + 1 mes → 28-feb en año común, → 29-feb en bisiesto).
 * - Opera sobre los campos de fecha en **UTC** y conserva la hora del
 *   instante base, de modo que el resultado no depende de la zona horaria del
 *   proceso. RNF-07 exige conversiones explícitas.
 * - Es un cálculo **hacia adelante** únicamente: `months` negativos no forman
 *   parte de la regla aprobada y no se cubren aquí.
 * - No interpreta fechas civiles del ERP: la zona horaria de negocio
 *   (`America/Bogota`) se aplica antes de llamar a esta función. Resolver esa
 *   conversión es una decisión pendiente (T-D2).
 *
 * @param base Instante base. `Invalid Date` o `NaN` en `months` produce
 *   `Invalid Date`, de forma explícita y sin lanzar.
 * @param months Meses a sumar. Se trunca a entero.
 * @returns Instante resultante, o `Invalid Date` si la entrada no es válida.
 */
export function addMonthsClamped(base: Date, months: number): Date {
  if (!(base instanceof Date) || Number.isNaN(base.getTime())) {
    return new Date(NaN);
  }
  if (typeof months !== 'number' || !Number.isFinite(months)) {
    return new Date(NaN);
  }

  const wholeMonths = Math.trunc(months);
  const day = base.getUTCDate();

  // Se trabaja sobre el mes destino en UTC y se resta 1 día al overflow antes
  // de fijar el mes: `setUTCMonth` normaliza 31-feb a 3-mar, no a 28-feb.
  const shifted = new Date(base.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + wholeMonths);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();

  shifted.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return shifted;
}

/**
 * Base del CICLO: la fecha de instalación. No es la base de la garantía.
 *
 * Se mantiene separada de `warrantyEnd` a propósito: D-1 cambió la base del
 * VENCIMIENTO a la fecha de compra, pero no redefinió cuándo empieza el ciclo.
 * Devuelve `null` cuando no hay instalación, que es lo que consulta el gate G8.
 *
 * @deprecated La base del ciclo es la fecha de compra (decisión aprobada). Esta
 * función se mantiene solo para callers externos; no debe usarse para anclar
 * etapas.
 */
export function baseDate(installationDate: Date | null): Date | null {
  return installationDate ?? null;
}

/**
 * Base canónica del ciclo comercial: la fecha de compra del ERP.
 *
 * Función de referencia para cualquier consumidor que necesite el ancla
 * temporal sin repetir la decisión. No acepta la fecha de instalación como
 * sustituto.
 */
export function cycleBaseDate(purchaseDate: Date | null): Date | null {
  return purchaseDate ?? null;
}

/**
 * Fin de garantía contado desde la FECHA DE COMPRA del ERP (D-1, PIT §4 RF-02).
 *
 * Antes se calculaba desde la instalación y con un multiplicador de días
 * (`30.4375`), lo que incumplía tres criterios del PIT a la vez: la base, el
 * método (días en lugar de meses de calendario) y el ajuste de fin de mes.
 *
 * Ahora usa `addMonthsClamped`, que suma meses calendario y ajusta al último
 * día válido del mes destino cuando el día no existe (P1.8). La fecha de
 * instalación no puede sustituir a la de compra.
 *
 * Si la garantía no está definida no hay ventana que comunicarle al cliente.
 */
export function warrantyEnd(
  purchaseDate: Date,
  warrantyMonths: number | null,
): Date | null {
  if (!warrantyMonths || warrantyMonths <= 0) {
    return null;
  }
  return addMonthsClamped(purchaseDate, warrantyMonths);
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

/**
 * Los hitos derivados del vencimiento heredan la base de D-1: se calculan
 * desde la fecha de compra a través de `warrantyEnd`.
 */
export function preExpiryAt(
  purchaseDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(purchaseDate, warrantyMonths);
  return end ? addDays(end, -PRE_EXPIRY_OFFSET_DAYS) : null;
}

export function postExpiry60At(
  purchaseDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(purchaseDate, warrantyMonths);
  return end ? addDays(end, POST_EXPIRY_60_OFFSET_DAYS) : null;
}

export function postExpiry90At(
  purchaseDate: Date,
  warrantyMonths: number | null,
): Date | null {
  const end = warrantyEnd(purchaseDate, warrantyMonths);
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
