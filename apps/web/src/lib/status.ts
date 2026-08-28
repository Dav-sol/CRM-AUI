// Mapper de estados unificado (Fase 4, T15): significado, texto en español
// neutro, color y variante de badge por estado. Centraliza las etiquetas que
// antes estaban dispersas para que SCHEDULED/EXECUTED/CANCELLED/DRAFT/APPROVED
// se vean y se comporten igual en toda la UI.

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline";

export type StateMeta = {
  label: string;
  variant: BadgeVariant;
  meaning: string;
};

const AUTOMATION_STATES: Record<string, StateMeta> = {
  PENDING: { label: "Pendiente", variant: "secondary", meaning: "Aún no programada." },
  SCHEDULED: { label: "Programada", variant: "secondary", meaning: "Se enviará en su fecha programada." },
  EXECUTING: { label: "Enviando", variant: "default", meaning: "El mensaje está en envío." },
  EXECUTED: { label: "Ejecutada", variant: "default", meaning: "Mensaje enviado." },
  CANCELLED: { label: "Cancelada", variant: "destructive", meaning: "No se enviará." },
  ERROR: { label: "Con error", variant: "destructive", meaning: "Falló el envío; reintentará." },
  PAUSED: { label: "Pausada", variant: "outline", meaning: "Seguimiento pausado." },
};

const CAMPAIGN_STATES: Record<string, StateMeta> = {
  DRAFT: { label: "Borrador", variant: "secondary", meaning: "En edición; sin aprobar." },
  APPROVED: { label: "Aprobada", variant: "default", meaning: "Aprobada por marketing; lista para activar." },
  ACTIVE: { label: "Activa", variant: "default", meaning: "En ejecución." },
  PAUSED: { label: "Pausada", variant: "outline", meaning: "Enviar se detuvo; se puede reanudar." },
  FINISHED: { label: "Finalizada", variant: "secondary", meaning: "Sin automatizaciones pendientes." },
  CANCELLED: { label: "Cancelada", variant: "destructive", meaning: "Terminal; no se enviará." },
};

export function getStateMeta(kind: "automation" | "campaign", status: string): StateMeta {
  const table = kind === "automation" ? AUTOMATION_STATES : CAMPAIGN_STATES;
  return table[status] ?? { label: status, variant: "secondary", meaning: "" };
}