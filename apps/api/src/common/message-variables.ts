// Fase P0.2: variables de mensaje soportadas. Un template es válido si TODOS
// sus placeholders `{...}` pertenecen a este set (se rechaza lo desconocido).

export const MESSAGE_VARIABLE_KEYS = [
  'customerName',
  'productName',
  'organizationName',
  'warrantyExpiresAt',
  'purchaseDate',
  'brand',
] as const;

export type MessageVariableKey = (typeof MESSAGE_VARIABLE_KEYS)[number];

const PLACEHOLDER_PATTERN = /\{([A-Za-z]+)\}/g;

export type MessageTemplateVars = {
  customerName: string;
  productName: string;
  organizationName: string;
  brand: string;
  warrantyExpiresAt?: Date | string | null;
  purchaseDate?: Date | string | null;
};

/**
 * Zona de presentación por defecto.
 *
 * El producto es multi-tenant y admite una zona por organización
 * (`ConfiguracionesService.timeZoneOrganizacion`, que cae en
 * `DEFAULT_TIMEZONE = 'America/Bogota'`). Fijar aquí una zona distinta rompería
 * a cualquier organización que no opere en Colombia, por lo que esta constante
 * es un **valor por defecto de presentación**, no una conversión de negocio.
 *
 * No altera qué instante se almacena ni cómo se calcula: solo hace que el texto
 * que ve el destinatario sea el mismo con independencia del reloj del servidor
 * (RNF-07). Para honrar la zona de cada organización, `formatVariableDate`
 * acepta un `timeZone` explícito que debe propagar el llamador.
 */
export const DEFAULT_PRESENTATION_TIME_ZONE = 'America/Bogota';

/**
 * Resuelve una zona utilizable. Si el valor recibido no es un identificador
 * IANA válido (`Intl` lanza `RangeError` al construirlo) o viene vacío, cae en
 * el valor por defecto documentado en lugar de romper el renderizado. Esto
 * cubre el caso en que la configuración almacenada es inválida: el DTO valida
 * el formato pero no que la zona exista.
 */
function safeTimeZone(timeZone?: string | null): string {
  if (!timeZone) {
    return DEFAULT_PRESENTATION_TIME_ZONE;
  }
  try {
    // Construir el formateador es la comprobación: si la zona no existe, lanza.
    new Intl.DateTimeFormat('es-CO', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_PRESENTATION_TIME_ZONE;
  }
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: safeTimeZone(timeZone),
  });
}

import { formatCivilDateLong } from './civil-date';

export function formatVariableDate(
  value: Date | string | null | undefined,
  timeZone: string = DEFAULT_PRESENTATION_TIME_ZONE,
): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return dateFormatter(timeZone).format(date);
}

// Deriva la marca del producto a partir de categoría/nombre
// (MAC/WILLARD/DUNCAN; de lo contrario "Otras marcas").
export function brandOf(
  category: string | null | undefined,
  name: string | null | undefined,
): string {
  const source = `${category ?? ''} ${name ?? ''}`.trim().toUpperCase();
  if (source.includes('MAC')) return 'MAC';
  if (source.includes('WILLARD')) return 'WILLARD';
  if (source.includes('DUNCAN')) return 'DUNCAN';
  return 'Otras marcas';
}

export function findInvalidVariables(template: string): string[] {
  const invalid = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1];
    if (!(MESSAGE_VARIABLE_KEYS as readonly string[]).includes(key)) {
      invalid.add(key);
    }
  }
  return [...invalid];
}

/**
 * `timeZone` es un parámetro opcional que la presentación propaga para que no
 * dependa del reloj del proceso (RNF-07). La firma pública permanece
 * compatible: los llamadores existentes siguen funcionando.
 *
 * Las dos fechas del template son **civiles** (columna `DATE`), no instantes:
 * su día es exactamente el que registró el negocio, así que se leen en UTC y
 * NO se desplazan por la zona de la organización — 00:00 UTC en Bogotá es el día
 * anterior —. Por eso la zona no altera hoy el resultado; queda propagada para
 * las variables de tipo instante, que sí dependen de ella (ver
 * `formatVariableDate`). `message-variables.spec.ts` fija esa invariante.
 */
export function renderTemplate(
  template: string,
  vars: MessageTemplateVars,
  _timeZone?: string,
): string {
  return (
    template
      .replace(/\{customerName\}/g, vars.customerName)
      .replace(/\{productName\}/g, vars.productName)
      .replace(/\{organizationName\}/g, vars.organizationName)
      .replace(/\{brand\}/g, vars.brand)
      // `purchaseDate` y `warrantyExpiresAt` son fechas CIVILES (columna `DATE`),
      // no instantes: su día es el que registró el negocio. Aplicarles la zona de
      // una organización los desplazaría un día hacia atrás, porque 00:00 UTC en
      // Bogotá es el día anterior.
      .replace(
        /\{warrantyExpiresAt\}/g,
        formatCivilDateLong(vars.warrantyExpiresAt),
      )
      .replace(/\{purchaseDate\}/g, formatCivilDateLong(vars.purchaseDate))
  );
}
