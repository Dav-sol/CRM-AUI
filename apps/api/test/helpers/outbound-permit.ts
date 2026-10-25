/**
 * Bloque B · CRIT-16-B · política de organizaciones EXCLUSIVA DE TEST.
 *
 * Problema que resuelve
 * ---------------------
 * `SendPermitGuard` exige, a la vez, `OUTBOUND_SEND_ENABLED='ENABLED'`, una
 * allowlist explícita de organizaciones, una allowlist de canales y una
 * ventana no vencida. En producción eso está `DENIED` y así debe seguir.
 *
 * Pero el valor no se puede mutar en caliente: `ConfigModule.forRoot({load:
 * [configuration]})` congela `process.env` en `internalConfig` UNA sola vez,
 * al hacer `.compile()`. Cualquier `process.env` asignado después no se lee.
 * Ese es el bloqueo real de CRIT-16-B: las suites generan UUIDs de
 * organización en runtime y la allowlist ya estaba congelada y vacía.
 *
 * La solución es, por tanto, inyectar la política ANTES de `.compile()` con
 * los UUIDs concretos que la propia suite acaba de crear. Es el mismo patrón
 * que la propia codebase ya usaba para `WHATSAPP_DEFAULT_ORGANIZATION_ID`
 * (ver `conversations.e2e-spec.ts:7` y `whatsapp.e2e-spec.ts:122`), no una
 * vía nueva: la config de test siempre se fija en `process.env` antes del
 * arranque de Nest.
 *
 * Qué NO hace (y por qué esto no es relajar una guarda)
 * -----------------------------------------------------
 *  - No toca `send-permit.ts`, `send-permit.guard.ts` ni `configuration.ts`:
 *    la lógica que se evalúa en test es EXACTAMENTE la de producción.
 *  - No añade ninguna vía de autorización reservada, wildcard ni comodín:
 *    la allowlist contiene únicamente los UUIDs que la suite crea para sí
 *    misma, y nada más.
 *  - No altera la política productiva: todo lo que escribe vive en
 *    `process.env` del PROCESO de test, que es distinto del contenedor
 *    `automatizeit-api`.
 *
 * Las garantías de que no puede haber un envío real son dos, ambas
 * independientes de esta política:
 *
 *  1. Proveedor simulado: las suites que la usan hacen
 *     `overrideProvider(WHATSAPP_PROVIDER)` con un `jest.fn()`, así que la
 *     llamada de red no existe.
 *  2. Egreso cortado a dos capas en `test/jest-e2e.setup.ts`: `fetch` y
 *     además `net.Socket#connect` / `net.connect` / `tls.connect`, todo lo
 *     que no sea loopback. Se prueba en `egress-guard.e2e-spec.ts`.
 *
 * Punto de fallo cerrado: la activación rechaza en seco cualquier proceso
 * que no esté sobre la base aislada. Si alguien la llamara contra
 * producción, no habilita nada: lanza.
 */

const SEND_KEYS = [
  'OUTBOUND_SEND_ENABLED',
  'OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS',
  'OUTBOUND_SEND_ALLOWED_CHANNELS',
  'OUTBOUND_SEND_UNTIL',
] as const;

type SendKeys = (typeof SEND_KEYS)[number];

/**
 * Única base sobre la que se permite activar la política. Es el mismo valor
 * que comprueba `jest-e2e.setup.ts` y `scripts/check-e2e-isolation.sh`.
 */
const ALLOWED_DATABASE = 'automatizeit_e2e';

/** Instante ISO válido y en el futuro lejano: la ventana nunca vence en CI. */
const TEST_WINDOW_UNTIL = '2099-12-31T23:59:59.000Z';

function isolationDatabase(): string | undefined {
  const url = process.env['DATABASE_URL'] ?? '';
  return url
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .split('/')
    .pop();
}

/**
 * Habilita la política de envío SOLO para los UUIDs indicados, y devuelve el
 * restaurador de los valores previos.
 *
 * Debe llamarse ANTES de `Test.createTestingModule(...).compile()`, porque es
 * ahí donde `configuration()` captura `process.env`.
 */
export function enableOutboundSendForTest(
  organizationIds: readonly string[],
): () => void {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error(
      '[outbound-permit] fuera de test: la política de envío no se activa.',
    );
  }

  const database = isolationDatabase();
  if (!database || database !== ALLOWED_DATABASE) {
    // Fallo cerrado: jamás se habilita un envío sobre una base que no sea la
    // aislada. Protege el caso de que este helper se reutilice en otro proceso.
    throw new Error(
      `[outbound-permit] DATABASE_URL apunta a '${database ?? '??'}' y no a ` +
        `'${ALLOWED_DATABASE}'. Política NO activada.`,
    );
  }

  if (organizationIds.length === 0) {
    throw new Error(
      '[outbound-permit] allowlist vacía: se exige una lista explícita.',
    );
  }

  const previous = new Map<SendKeys, string | undefined>();
  for (const key of SEND_KEYS) {
    previous.set(key, process.env[key]);
  }

  process.env['OUTBOUND_SEND_ENABLED'] = 'ENABLED';
  process.env['OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS'] =
    organizationIds.join(',');
  // Solo el canal que la suite mockea. SMS queda fuera a propósito.
  process.env['OUTBOUND_SEND_ALLOWED_CHANNELS'] = 'WHATSAPP';
  process.env['OUTBOUND_SEND_UNTIL'] = TEST_WINDOW_UNTIL;

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
