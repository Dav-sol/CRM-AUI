import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Zona horaria de presentación.
 *
 * Antes estas funciones usaban `date-fns` sin zona, por lo que el resultado
 * dependía de la zona horaria del NAVEGADOR del asesor: la misma compra podía
 * mostrarse con un día distinto según desde dónde se abría la pantalla.
 * Fijarla hace que la fecha mostrada sea siempre la fecha civil de Colombia,
 * que es el calendario operativo del producto (RNF-07).
 *
 * No altera datos, cálculos ni contratos de API: solo la presentación.
 */
export const PRESENTATION_TIME_ZONE = "America/Bogota";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: PRESENTATION_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: PRESENTATION_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: PRESENTATION_TIME_ZONE,
});

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

const civilDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  // Una fecha civil es el día del calendario, no un instante: se lee con sus
  // propios campos UTC. Aplicarle la zona operativa la desplazaría un día hacia
  // atrás, porque las columnas `DATE` llegan a las 00:00 UTC.
  timeZone: "UTC",
});

const civilDateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/**
 * Formatea una **fecha civil** (columna `DATE`: `purchaseDate`,
 * `warrantyExpiresAt`, `installationDate`). Muestra exactamente el día que
 * registró el negocio.
 *
 * No usar `formatDate` para estos campos: al aplicar la zona operativa, un
 * valor a las 00:00 UTC se mostraría como el día anterior.
 */
export function formatCivilDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? civilDateFormatter.format(date) : "—";
}

/** Igual que `formatCivilDate`, con hora. */
export function formatCivilDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? civilDateTimeFormatter.format(date) : "—";
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "—";
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return formatDistanceToNowStrict(new Date(value), {
    addSuffix: true,
    locale: es,
  });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat("es-ES").format(value);
}

// Fase 6 (T21): moneda centralizada (COP es-ES, 2 decimales). Reemplaza los
// formateos manuales dispersos ($X.XXX vs XXXX).
export function formatCurrency(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("54")) {
    return `+54 ${digits.slice(2, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  return value;
}

export function initials(firstName?: string, lastName?: string): string {
  const first = firstName?.trim().charAt(0) ?? "";
  const last = lastName?.trim().charAt(0) ?? "";
  return (first + last).toUpperCase() || "?";
}

export function fullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(" ") || "—";
}