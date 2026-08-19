import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "dd MMM yyyy, HH:mm", { locale: es });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "dd MMM yyyy", { locale: es });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "HH:mm", { locale: es });
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