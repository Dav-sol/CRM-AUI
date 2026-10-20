/**
 * Contrato de fecha civil (`YYYY-MM-DD`) aprobado para las fechas comerciales
 * del ERP.
 *
 * Contexto (PIT §2.1, decisiones D-1 y P1.8):
 * - La fecha de compra del ERP es la **fecha base** del vencimiento de garantía
 *   (D-1). La fecha de instalación no la sustituye.
 * - El vencimiento suma **meses calendario** conservando el día y ajustando al
 *   último día válido del mes destino cuando el día no existe (P1.8).
 * - RNF-07 exige zona de negocio explícita: `America/Bogota`.
 *
 * Estas columnas se persisten como `DATE` de PostgreSQL, no como instante.
 * Prisma devuelve una fecha civil como `Date` a las 00:00:00 **UTC**, y ese
 * es el representation con la que hay que trabajar: leer o escribir con
 * `getDate()`/`setMonth()` (hora local del proceso) desplazaría el día, por lo
 * que la aritmética de meses vive en `lifecycle.rules.addMonthsClamped`, que
 * opera sobre los campos UTC.
 */

/** Zona operativa del cliente. No confundir con la zona del servidor. */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

/** Formato canónico de entrada y de serialización civil. */
export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formatos de entrada admitidos en la frontera de compras.
 *
 * 1. `YYYY-MM-DD` — formato canónico (fecha civil).
 * 2. `YYYY-MM-DDTHH:mm[:ss[.sss]](Z|±HH:MM)` — instante **inequívoco**, porque
 *    declara su zona. Es el formato que produce el formulario web actual
 *    (`new Date(...).toISOString()`) y el que documenta hoy el OpenAPI
 *    (`format: date-time`).
 *
 * NO se admite `YYYY-MM-DDTHH:mm:ss` sin zona: su interpretación depende del
 * reloj del proceso, que difiere entre el host (`America/Bogota`) y el
 * contenedor de la API (UTC), de modo que el mismo valor produciría días
 * distintos según dónde se ejecutase.
 */
export const PURCHASE_DATE_INPUT_PATTERN =
  /^\d{4}-\d{2}-\d{2}$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Comprueba que `value` es una fecha civil canónica **y real**.
 *
 * El regex por sí solo acepta `2026-02-30`, que no existe. Se valida el
 * resultado de la conversión para rechazarla explícitamente en la frontera, en
 * lugar de dejar que el motor la normalice en silencio.
 */
export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CIVIL_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Convierte una fecha civil a su `Date` de representación (00:00:00 UTC), que
 * es lo que Prisma espera para una columna `DATE`.
 *
 * Lanza si el valor no es una fecha civil canónica: la frontera debe rechazar
 * `2026-01-31T18:00:00Z` en lugar de truncarlo a `2026-01-31` sin dejar rastro.
 */
export function parseCivilDate(value: string): Date {
  if (!isCivilDate(value)) {
    // `value` es `never` tras el guard porque el tipo ya es `string`; se
    // conserva el valor recibido en el mensaje sin usar aserción.
    throw new Error(
      `Fecha civil inválida: se esperaba YYYY-MM-DD y se recibió "${String(value)}"`,
    );
  }
  return new Date(`${value}T00:00:00.000Z`);
}

/** Partes de fecha civil de un instante, en la zona operativa del cliente. */
function civilPartsInBusinessZone(instant: Date): {
  year: string;
  month: string;
  day: string;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (type: 'year' | 'month' | 'day'): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/**
 * Día civil de un instante en la zona operativa (`America/Bogota`).
 *
 * Es la adaptación explícita para los consumidores que envían un instante
 * inequívoco: el día que se conserva es el que el negocio habría visto en su
 * reloj, no el del servidor UTC. Convierte de forma explícita porque el PIT no
 * autoriza desplazamientos implícitos.
 */
export function instantToBusinessCivilDate(instant: Date): string {
  const { year, month, day } = civilPartsInBusinessZone(instant);
  return `${year}-${month}-${day}`;
}

/** `true` si el valor es un instante con zona declarada. */
function isZonedInstant(value: string): boolean {
  return /T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/.test(value);
}

/**
 * Entrada de la frontera de compras.
 *
 * - Fecha civil `YYYY-MM-DD`: se usa tal cual.
 * - Instante con zona declarada: se convierte a su día civil en
 *   `America/Bogota`.
 * - Cualquier otro formato, incluido un instante SIN zona: se rechaza, para no
 *   convertir en silencio un valor ambiguo.
 *
 * @throws Error con el motivo del rechazo.
 */
export function parsePurchaseDateInput(value: string): Date {
  if (isCivilDate(value)) {
    return parseCivilDate(value);
  }
  if (PURCHASE_DATE_INPUT_PATTERN.test(value) && isZonedInstant(value)) {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      throw new Error(`Instante inválido: "${String(value)}"`);
    }
    const civil = instantToBusinessCivilDate(instant);
    if (!isCivilDate(civil)) {
      throw new Error(
        `No se pudo derivar una fecha civil de "${String(value)}"`,
      );
    }
    return parseCivilDate(civil);
  }
  throw new Error(
    `purchaseDate inválido: se esperaba YYYY-MM-DD o un instante con zona ` +
      `(ISO 8601) y se recibió "${String(value)}"`,
  );
}

/** Indica si el valor es admisible por la frontera de compras. */
export function isPurchaseDateInput(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return (
    isCivilDate(value) ||
    (PURCHASE_DATE_INPUT_PATTERN.test(value) && isZonedInstant(value))
  );
}

/** Serializa a fecha civil `YYYY-MM-DD` leyendo los campos UTC. */
export function toCivilDateString(value: Date | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

const CIVIL_LONG_FORMAT = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // Se lee el día almacenado con los propios campos UTC de la columna `DATE`.
  // Aplicar la zona de una organización a una fecha civil la desplazaría un día
  // hacia atrás (00:00 UTC en Bogotá es el día anterior).
  timeZone: 'UTC',
});

/**
 * Presenta una fecha civil en formato largo ("31 de enero de 2026").
 *
 * Una fecha civil NO es un instante: no tiene zona ni hora, y su día es
 * exactamente el que el negocio registró. Por eso se lee en UTC y no en la
 * zona de la organización, que solo tiene sentido para instantes (cuándo
 * enviar, no qué día se compró).
 */
export function formatCivilDateLong(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return CIVIL_LONG_FORMAT.format(date);
}
