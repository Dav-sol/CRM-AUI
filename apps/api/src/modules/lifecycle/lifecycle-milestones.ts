/**
 * Planificador de hitos del ciclo comercial.
 *
 * ══ AUTORIDAD ══
 * Las etapas de este módulo son EXCLUSIVAMENTE las que el PIT
 * (`specs/026-pit-final/pit.md`) define con texto y plazo:
 *
 *   RF-03  Revisiones durante la garantía, cada dos meses desde la fecha base
 *          (la fecha de compra del ERP): meses 2, 4, 6, 8, 10, 12, 14…
 *          hasta el vencimiento, sin programar revisiones fuera de la garantía.
 *   RF-07  Etapa previa al vencimiento, 30 días antes de la fecha de
 *          vencimiento.
 *   RF-06  Secuencia de retención, medida desde el VENCIMIENTO ORIGINAL:
 *          +60d, +90d, +6m, +12m, +18m.
 *
 * ══ DESCARTADO POR FALTA DE AUTORIDAD ══
 * Los plazos `+3d`, `+60d/+67d` (mantenimiento) y la ventana de reseña `2..5`
 * procedían de `spec-025`, que está vacío y por tanto ya no aporta ninguna
 * autoridad funcional. No se reimplementan aquí ni se sustituyen por otros
 * plazos inventados: RF-04 y RF-05 describen el contacto inicial de captura
 * de placa y la solicitud de reseña, pero el PIT no fija ningún desplazamiento
 * para ellas.
 *
 * ══ BASE TEMPORAL ══
 * Todo se ancla en la fecha de compra del ERP (decisión D-1) y se calcula con
 * meses de calendario y ajuste de fin de mes (P1.8). La fecha de instalación no
 * sustituye a la de compra.
 */
import {
  POST_EXPIRY_60_OFFSET_DAYS,
  POST_EXPIRY_90_OFFSET_DAYS,
  PRE_EXPIRY_OFFSET_DAYS,
  addDays,
  addMonthsClamped,
  warrantyEnd,
  type CommunicationCategory,
} from './lifecycle.rules';

export type MilestoneKind =
  | 'REVIEW_BIMONTHLY'
  | 'PRE_EXPIRY'
  | 'RETENTION_60D'
  | 'RETENTION_90D'
  | 'RETENTION_6M'
  | 'RETENTION_12M'
  | 'RETENTION_18M';

export type PlannedMilestone = {
  kind: MilestoneKind;
  /** Fecha objetivo civil. */
  scheduledDate: Date;
  /** Etiqueta legible para logs y para la interfaz del asesor. */
  stageName: string;
  category: CommunicationCategory;
  /**
   * Desplazamiento respecto a su ancla, para trazabilidad. En las revisiones
   * bimensuales el ancla es la compra; en el resto, el vencimiento.
   */
  offsetLabel: string;
};

export type MilestonePlanInput = {
  /**
   * Base de todo el ciclo comercial (decisión aprobada): la fecha de compra
   * registrada por el ERP. Sin ella no hay ciclo y no se planifica nada.
   */
  purchaseDate: Date | null;
  warrantyMonths: number | null;
};

/** Cadencia de revisiones durante la garantía (RF-03): meses 2, 4, 6, 8… */
export const REVIEW_INTERVAL_MONTHS = 2;

const STAGE_NAMES: Record<MilestoneKind, string> = {
  REVIEW_BIMONTHLY: 'Revisión de garantía',
  PRE_EXPIRY: 'Vencimiento próximo',
  RETENTION_60D: 'Retención (+60 días)',
  RETENTION_90D: 'Retención (+90 días)',
  RETENTION_6M: 'Retención (+6 meses)',
  RETENTION_12M: 'Retención (+12 meses)',
  RETENTION_18M: 'Retención (+18 meses)',
};

/** Secuencia de retención del PIT (RF-06), anclada al vencimiento original. */
const RETENTION_PLAN: Array<{
  kind: MilestoneKind;
  label: string;
  apply: (expiry: Date) => Date;
}> = [
  {
    kind: 'RETENTION_60D',
    label: '+60d',
    apply: (expiry) => addDays(expiry, POST_EXPIRY_60_OFFSET_DAYS),
  },
  {
    kind: 'RETENTION_90D',
    label: '+90d',
    apply: (expiry) => addDays(expiry, POST_EXPIRY_90_OFFSET_DAYS),
  },
  {
    kind: 'RETENTION_6M',
    label: '+6m',
    apply: (expiry) => addMonthsClamped(expiry, 6),
  },
  {
    kind: 'RETENTION_12M',
    label: '+12m',
    apply: (expiry) => addMonthsClamped(expiry, 12),
  },
  {
    kind: 'RETENTION_18M',
    label: '+18m',
    apply: (expiry) => addMonthsClamped(expiry, 18),
  },
];

/**
 * Hitos del ciclo comercial, ordenados por fecha.
 *
 * Devuelve una lista vacía si falta la fecha de compra (no hay ciclo) o si no
 * hay garantía definida (no hay ventana de garantía sobre la que programar).
 * Nunca inventa ni desplaza una fecha para rellenar un hueco.
 *
 * Es una función pura: llamarla dos veces con la misma entrada devuelve el
 * mismo resultado, lo que permite comprobar la idempotencia del ciclo.
 */
export function planMilestones(input: MilestonePlanInput): PlannedMilestone[] {
  const base = input.purchaseDate;
  if (!base) {
    return [];
  }

  const expiry = warrantyEnd(base, input.warrantyMonths);
  if (!expiry) {
    return [];
  }

  const months = input.warrantyMonths as number;
  const milestones: PlannedMilestone[] = [];
  const push = (
    kind: MilestoneKind,
    scheduledDate: Date,
    category: CommunicationCategory,
    offsetLabel: string,
  ): void => {
    milestones.push({
      kind,
      scheduledDate,
      stageName: STAGE_NAMES[kind],
      category,
      offsetLabel,
    });
  };

  // RF-03: revisiones cada dos meses desde la compra, sin sobrepasar la
  // garantía. El mes final se incluye solo si cae dentro de la vigencia.
  for (
    let month = REVIEW_INTERVAL_MONTHS;
    month <= months;
    month += REVIEW_INTERVAL_MONTHS
  ) {
    const date = addMonthsClamped(base, month);
    if (date.getTime() <= expiry.getTime()) {
      push('REVIEW_BIMONTHLY', date, 'OTHER', `+${month}m`);
    }
  }

  // RF-07: 30 días antes del vencimiento. No se programa si ya está en el
  // pasado respecto a la compra, porque no sería una etapa de este ciclo.
  const preExpiry = addDays(expiry, -PRE_EXPIRY_OFFSET_DAYS);
  if (preExpiry.getTime() > base.getTime()) {
    push('PRE_EXPIRY', preExpiry, 'WARRANTY_EXPIRY', '-30d');
  }

  // RF-06: los cinco impactos, todos desde el vencimiento ORIGINAL.
  for (const step of RETENTION_PLAN) {
    push(step.kind, step.apply(expiry), 'WARRANTY_EXPIRY', step.label);
  }

  return milestones.sort(
    (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime(),
  );
}

/**
 * Hitos que ya vencieron en el instante dado. Se usa al registrar una compra
 * con retraso: no se generan mensajes retroactivos.
 */
export function elapsedMilestones(
  milestones: PlannedMilestone[],
  at: Date,
): PlannedMilestone[] {
  return milestones.filter((m) => m.scheduledDate.getTime() <= at.getTime());
}

/**
 * Origen del texto de cada hito. QUEDA AISLADO A PROPÓSITO: el PIT describe la
 * acción de cada etapa pero no su contenido, y las plantillas están pendientes
 * de aprobación con el proveedor (P0.6). No se inventa contenido.
 */
export type MilestoneTemplateSource = 'PENDING_DECISION';
