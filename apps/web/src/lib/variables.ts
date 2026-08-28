// Fase P0.2: variables de mensaje soportadas. El usuario las inserta con un
// clic; las variables desconocidas se rechazan al aprobar/activar.

export type MessageVariable = {
  key: string;
  label: string;
  hint: string;
};

export const MESSAGE_VARIABLES: MessageVariable[] = [
  { key: "{customerName}", label: "Nombre del cliente", hint: "Carlos Mendoza" },
  { key: "{productName}", label: "Producto", hint: "24BD850 BATERIA WILLARD EXTREMA" },
  { key: "{brand}", label: "Marca", hint: "WILLARD" },
  { key: "{warrantyExpiresAt}", label: "Fecha de vencimiento", hint: "15 de marzo de 2027" },
  { key: "{purchaseDate}", label: "Fecha de compra", hint: "15 de marzo de 2026" },
  { key: "{organizationName}", label: "Organización", hint: "Baterías del Caribe" },
];

export const PREVIEW_SAMPLE = {
  customerName: "Carlos Mendoza",
  productName: "24BD850 BATERIA WILLARD EXTREMA",
  brand: "WILLARD",
  organizationName: "Baterías del Caribe",
  warrantyExpiresAt: "15 de marzo de 2027",
  purchaseDate: "15 de marzo de 2026",
} as const;

const PLACEHOLDER_PATTERN = /\{([A-Za-z]+)\}/g;

export function findInvalidVariables(template: string): string[] {
  const invalid = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1];
    if (!MESSAGE_VARIABLES.some((variable) => variable.key === `{${key}}`)) {
      invalid.add(key);
    }
  }
  return [...invalid];
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return MESSAGE_VARIABLES.reduce(
    (result, variable) =>
      result.replaceAll(variable.key, vars[variable.key] ?? variable.key),
    template,
  );
}