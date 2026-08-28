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

const DATE_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatVariableDate(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return DATE_FORMATTER.format(date);
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

export function renderTemplate(
  template: string,
  vars: MessageTemplateVars,
): string {
  return template
    .replace(/\{customerName\}/g, vars.customerName)
    .replace(/\{productName\}/g, vars.productName)
    .replace(/\{organizationName\}/g, vars.organizationName)
    .replace(/\{brand\}/g, vars.brand)
    .replace(/\{warrantyExpiresAt\}/g, formatVariableDate(vars.warrantyExpiresAt))
    .replace(/\{purchaseDate\}/g, formatVariableDate(vars.purchaseDate));
}