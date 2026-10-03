/**
 * Clasificación de una respuesta entrante para decidir su efecto sobre el
 * lifecycle (spec 025 §6 y §10).
 *
 * Deliberadamente conservadora y SOLO sobre el texto ya presente en el
 * sistema. No hay modelo de lenguaje ni NLP: PD-7 sigue pendiente y aquí solo
 * se recognize lo que la especificación nombra de forma literal.
 *
 * Regla que atraviesa todo el módulo: la ausencia de una señal NO es una señal.
 * En particular, "sí", "gracias" y "ok" NO constituyen consentimiento de
 * mantenimiento (§4.6): el consentimiento requiere una interacción explícita,
 * que el canal actual no soporta todavía.
 */

export type InboundSignal =
  /** Reclamación: suspende todas las automatizaciones del ciclo (§17/§6). */
  | 'COMPLAINT'
  /** Requiere atención humana: pausa el lifecycle hasta cierre (§16). */
  | 'HUMAN_ATTENTION'
  /** Pide no recibir más mensajes: opt-out global del cliente (§21). */
  | 'OPT_OUT'
  /** Sin efecto sobre el lifecycle. */
  | 'NONE';

/**
 * Frases que el documento funcional nombra de forma literal como
 * "requieren atención humana" (§16). Son marcadores explícitos de una
 * intención, no un intento de entender lenguaje natural.
 */
const HUMAN_ATTENTION_MARKERS: readonly string[] = [
  'quiero hablar con alguien',
  'necesito hablar con alguien',
  'hablar con un asesor',
  'hablar con alguien',
  'tengo un problema con la bateria',
  'la bateria esta fallando',
  'la bateria me esta fallando',
  'por que se me esta descargando',
  'necesito revisar otra cosa',
];

/** Petición expresa de no recibir más mensajes (§21). */
const OPT_OUT_MARKERS: readonly string[] = [
  'no me escriban mas',
  'no me escribas mas',
  'no quiero recibir mas mensajes',
  'no quiero mas mensajes',
  'dejen de escribirme',
  'no estan interesados',
];

/**
 * Reclamación (§17): el cliente reporta un problema con el producto o el
 * servicio. Se distingue de "atención humana" porque abre un caso auditable
 * con resolución, mientras que la atención humana solo pausa.
 */
const COMPLAINT_MARKERS: readonly string[] = [
  'me danio la bateria',
  'se me danio la bateria',
  'la bateria fallo',
  'estaba fundida',
  'producto defectuoso',
  'me devuelvan el dinero',
  'quiero una devolucion',
  'reclamo',
  'queja',
];

/** Normaliza a minúsculas y sin acentos para comparar de forma estable. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Señal principal de un mensaje entrante. El orden importa: el opt-out es
 * global y gana a todo; la reclamación abre un caso; la atención humana solo
 * pausa.
 */
export function classifyInbound(text: string): InboundSignal {
  const normalized = normalize(text);
  if (!normalized) return 'NONE';

  const has = (markers: readonly string[]) =>
    markers.some((marker) => normalized.includes(normalize(marker)));

  if (has(OPT_OUT_MARKERS)) return 'OPT_OUT';
  if (has(COMPLAINT_MARKERS)) return 'COMPLAINT';
  if (has(HUMAN_ATTENTION_MARKERS)) return 'HUMAN_ATTENTION';
  return 'NONE';
}

/**
 * ¿Este texto constituye una respuesta de consentimiento explícita?
 *
 * Siempre devuelve false a propósito: PD-7 (soporte de botones o
 * interacción estructurada) sigue pendiente, y la especificación prohíbe
 * convertir "sí", "gracias" u "ok" en consentimiento. Cuando exista el
 * mecanismo, esta función será el único punto a cambiar.
 */
export function isExplicitMaintenanceConsent(): boolean {
  return false;
}
