/**
 * Planificador de hitos del lifecycle (spec 025 §3).
 *
 * Devuelve QUÉ hito, CUÁNDO y con qué prioridad. No devuelve texto: el origen
 * del contenido de cada hito es una decisión pendiente (ver
 * `MilestoneTemplateSource`), porque la spec define la acción pero no el texto,
 * y el catálogo de plantillas está a la espera de revisión con Meta.
 *
 * Reglas implementadas, todas cerradas en la spec:
 *   §3  Reseña entre 2 y 5 días, una sola vez por cliente/ciclo
 *   §3  Mantenimiento solo con consentimiento; +60 y +7; parada tras el 2º
 *   §3  Garantía sin mensajes periódicos no consentidos
 *   §9  Primer contacto pre-vencimiento a -30
 *   §13 +60 recuperación
 *   §14 +90 se envía aunque ignoró +60
 *   §5  Prioridad: vencimiento > mantenimiento consentido > resto
 *
 * NO implementado por decisión pendiente:
 *   §10  Segundo contacto pre-vencimiento → PD-1 (sin condición definida)
 *   §15  Cadencia de la campaña post-vencimiento → PD-8
 */
import {
  MAINTENANCE_1ST_OFFSET_DAYS,
  MAINTENANCE_2ND_OFFSET_DAYS,
  POST_EXPIRY_60_OFFSET_DAYS,
  POST_EXPIRY_90_OFFSET_DAYS,
  PRE_EXPIRY_OFFSET_DAYS,
  REVIEW_MAX_DAYS,
  REVIEW_MIN_DAYS,
  warrantyEnd,
  type CommunicationCategory,
} from './lifecycle.rules';

export type MilestoneKind =
  | 'REVIEW'
  | 'MAINTENANCE_1ST'
  | 'MAINTENANCE_2ND'
  | 'PRE_EXPIRY'
  | 'POST_EXPIRY_60'
  | 'POST_EXPIRY_90';

export type PlannedMilestone = {
  kind: MilestoneKind;
  /** Fecha objetivo, en la misma base que la instalación. */
  scheduledDate: Date;
  /** Etiqueta legible para logs y para la UI del asesor. */
  stageName: string;
  category: CommunicationCategory;
  /** Los hitos de mantenimiento dependen del gate G7. */
  requiresMaintenanceConsent: boolean;
  /** Los de garantía/vencimiento nunca se saltan por consentimiento. */
  requiresValidInstallation: true;
};

export type MilestonePlanInput = {
  /** §1: fecha base. Sin ella no hay lifecycle y no se planifica nada. */
  installationDate: Date | null;
  warrantyMonths: number | null;
  /** Días desde la instalación dentro de la ventana 2..5 (PD-10 lo define). */
  reviewOffsetDays: number;
  /** Intentos de mantenimiento ya realizados. A partir del 2º no hay más. */
  maintenanceAttemptsMade?: number;
};

const STAGE_NAMES: Record<MilestoneKind, string> = {
  REVIEW: 'Solicitud de reseña',
  MAINTENANCE_1ST: 'Revisión preventiva (1er intento)',
  MAINTENANCE_2ND: 'Revisión preventiva (2º intento)',
  PRE_EXPIRY: 'Pre-vencimiento de garantía',
  POST_EXPIRY_60: 'Recuperación post-garantía (+60)',
  POST_EXPIRY_90: 'Recuperación post-garantía (+90)',
};

const DAY = 86_400_000;
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY);

/**
 * Devuelve los hitos planificados, ordenados por fecha.
 *
 * Sin `installationDate` devuelve lista vacía: es el gate G8 y no se sustituye
 * por la fecha de venta (§1). Sin garantía no hay hitos de vencimiento, pero
 * la reseña y el mantenimiento sí dependen solo de la instalación.
 */
export function planMilestones(input: MilestonePlanInput): PlannedMilestone[] {
  const base = input.installationDate;
  if (!base) {
    return [];
  }

  const milestones: PlannedMilestone[] = [];
  const push = (
    kind: MilestoneKind,
    scheduledDate: Date,
    category: CommunicationCategory,
    requiresMaintenanceConsent: boolean,
  ) => {
    milestones.push({
      kind,
      scheduledDate,
      stageName: STAGE_NAMES[kind],
      category,
      requiresMaintenanceConsent,
      requiresValidInstallation: true,
    });
  };

  // §3: la reseña cae dentro de la ventana 2..5. El día exacto lo decide PD-10
  // y llega en `reviewOffsetDays`; aquí solo se acota.
  if (
    input.reviewOffsetDays >= REVIEW_MIN_DAYS &&
    input.reviewOffsetDays <= REVIEW_MAX_DAYS
  ) {
    push('REVIEW', addDays(base, input.reviewOffsetDays), 'OTHER', false);
  }

  // §3: mantenimiento solo con consentimiento, dos intentos y parada.
  const attempts = input.maintenanceAttemptsMade ?? 0;
  if (attempts < 1) {
    push(
      'MAINTENANCE_1ST',
      addDays(base, MAINTENANCE_1ST_OFFSET_DAYS),
      'MAINTENANCE_CONSENTED',
      true,
    );
  } else if (attempts < 2) {
    push(
      'MAINTENANCE_2ND',
      addDays(base, MAINTENANCE_1ST_OFFSET_DAYS + MAINTENANCE_2ND_OFFSET_DAYS),
      'MAINTENANCE_CONSENTED',
      true,
    );
  }
  // attempts >= 2: no hay más recordatorios de mantenimiento (§3).

  // §9/§13/§14: hitos anclados al fin de garantía.
  const end = warrantyEnd(base, input.warrantyMonths);
  if (end) {
    push(
      'PRE_EXPIRY',
      addDays(end, -PRE_EXPIRY_OFFSET_DAYS),
      'WARRANTY_EXPIRY',
      false,
    );
    push(
      'POST_EXPIRY_60',
      addDays(end, POST_EXPIRY_60_OFFSET_DAYS),
      'WARRANTY_EXPIRY',
      false,
    );
    push(
      'POST_EXPIRY_90',
      addDays(end, POST_EXPIRY_90_OFFSET_DAYS),
      'WARRANTY_EXPIRY',
      false,
    );
  }

  return milestones.sort(
    (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime(),
  );
}

/**
 * Hitos que ya vencieron en el instante dado. Se usa al entrar la instalación
 * tarde: no se generan mensajes retroactivos, se marcan SKIPPED (§4.5).
 */
export function elapsedMilestones(
  milestones: PlannedMilestone[],
  at: Date,
): PlannedMilestone[] {
  return milestones.filter((m) => m.scheduledDate.getTime() <= at.getTime());
}

/**
 * Origen del texto de cada hito. QUEDA AISLADO A PROPÓSITO: la spec define la
 * acción de cada hito pero no su contenido, y el catálogo de plantillas está
 * pendiente de revisión con Meta. No se inventa contenido ni se copian textos
 * sin aprobación.
 */
export type MilestoneTemplateSource = 'PENDING_DECISION';
