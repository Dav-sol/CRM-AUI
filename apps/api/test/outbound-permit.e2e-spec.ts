/**
 * Bloque B · CRIT-16-B · garantías del mecanismo de política exclusivo de test.
 *
 * Estas pruebas no comprueban que un envío salga: comprueban que el
 * interruptor SOLO puede ponerse en un proceso de test y SOLO sobre la base
 * aislada, y que se restaura. Es la parte que hace que la activación de la
 * política en `whatsapp.e2e-spec.ts` / `conversations.e2e-spec.ts` no sea una
 * relajación de la guarda: fuera de esas condiciones, el helper no habilita
 * nada y lanza.
 */

import { enableOutboundSendForTest } from './helpers/outbound-permit';

const SEND_KEYS = [
  'OUTBOUND_SEND_ENABLED',
  'OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS',
  'OUTBOUND_SEND_ALLOWED_CHANNELS',
  'OUTBOUND_SEND_UNTIL',
] as const;

type Snapshot = Record<string, string | undefined>;

function snapshot(): Snapshot {
  const values: Snapshot = {};
  for (const key of SEND_KEYS) {
    values[key] = process.env[key];
  }
  return values;
}

function restore(values: Snapshot): void {
  for (const key of SEND_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('CRIT-16-B — el mecanismo de política es exclusivo de test', () => {
  const originalDatabase = process.env['DATABASE_URL'];
  const originalNodeEnv = process.env['NODE_ENV'];
  let before: Snapshot;

  beforeEach(() => {
    before = snapshot();
  });

  afterEach(() => {
    restore(before);
    if (originalDatabase === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = originalDatabase;
    }
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });

  const isolatedUrl =
    'postgresql://automatizeit_e2e:secret@localhost:5433/automatizeit_e2e';

  it('activa la política únicamente para los UUIDs recibidos', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = isolatedUrl;

    const restorePolicy = enableOutboundSendForTest(['org-1', 'org-2']);

    expect(process.env['OUTBOUND_SEND_ENABLED']).toBe('ENABLED');
    // Allowlist exacta: ni comodín, ni wildcard, ni "todas las organizaciones".
    expect(process.env['OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS']).toBe(
      'org-1,org-2',
    );
    expect(process.env['OUTBOUND_SEND_ALLOWED_CHANNELS']).toBe('WHATSAPP');
    expect(process.env['OUTBOUND_SEND_UNTIL']).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    restorePolicy();
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBeUndefined();
  });

  it('restaura exactamente los valores previos, incluidos los definidos', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = isolatedUrl;
    process.env['OUTBOUND_SEND_ENABLED'] = 'DENIED';
    process.env['OUTBOUND_SEND_ALLOWED_CHANNELS'] = 'SMS';

    const restorePolicy = enableOutboundSendForTest(['org-1']);
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBe('ENABLED');

    restorePolicy();
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBe('DENIED');
    expect(process.env['OUTBOUND_SEND_ALLOWED_CHANNELS']).toBe('SMS');
    expect(
      process.env['OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS'],
    ).toBeUndefined();
  });

  it('FALLO CERRADO: no se activa si DATABASE_URL no es la base aislada', () => {
    process.env['NODE_ENV'] = 'test';
    // Producción ('automatizeit'): el helper no debe tocar nada.
    process.env['DATABASE_URL'] =
      'postgresql://automatizeit:secret@localhost:5433/automatizeit';

    expect(() => enableOutboundSendForTest(['org-1'])).toThrow(
      /Política NO activada/,
    );
    // Ni siquiera a medias: ni el interruptor ni la allowlist cambian.
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBeUndefined();
    expect(
      process.env['OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS'],
    ).toBeUndefined();
  });

  it('FALLO CERRADO: rechaza cualquier base que no sea automatizeit_e2e', () => {
    process.env['NODE_ENV'] = 'test';
    const forbidden = [
      'postgresql://x@localhost:5433/automatizeit_e2e_restore',
      'postgresql://x@localhost:5433/automatizeit_restorecheck_20261021',
      'postgresql://x@localhost:5433/postgres',
      'postgresql://x@localhost:5433/otra_base',
      '',
    ];

    for (const url of forbidden) {
      process.env['DATABASE_URL'] = url;
      expect(() => enableOutboundSendForTest(['org-1'])).toThrow();
      expect(process.env['OUTBOUND_SEND_ENABLED']).toBeUndefined();
    }
  });

  it('FALLO CERRADO: no se activa fuera de NODE_ENV=test', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['DATABASE_URL'] = isolatedUrl;

    expect(() => enableOutboundSendForTest(['org-1'])).toThrow(/fuera de test/);
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBeUndefined();
  });

  it('FALLO CERRADO: exige una allowlist explícita, nunca vacía', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = isolatedUrl;

    expect(() => enableOutboundSendForTest([])).toThrow(/allowlist vacía/);
    expect(process.env['OUTBOUND_SEND_ENABLED']).toBeUndefined();
  });

  it('no escribe ninguna clave fuera de las cuatro de la política', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = isolatedUrl;

    const beforeKeys = new Set(Object.keys(process.env));
    const restorePolicy = enableOutboundSendForTest(['org-1']);
    const added = Object.keys(process.env).filter((k) => !beforeKeys.has(k));
    restorePolicy();

    // Solo puede aparecer alguna clave si estaba ausente antes; las cuatro
    // de la política son las únicas que este helper manipula.
    expect(added.every((k) => SEND_KEYS.includes(k as never))).toBe(true);
  });
});
