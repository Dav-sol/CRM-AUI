import {
  SEND_PERMIT_DENIED_TOKEN,
  SEND_PERMIT_ENABLED_TOKEN,
  SendBlockedError,
  evaluateSendPermit,
  parseCsvList,
  type SendPermitPolicy,
} from './send-permit';

const NOW = new Date('2026-10-10T15:00:00.000Z');

function policy(overrides: Partial<SendPermitPolicy> = {}): SendPermitPolicy {
  return {
    enabled: SEND_PERMIT_ENABLED_TOKEN,
    allowedOrganizations: ['org-1'],
    allowedChannels: ['WHATSAPP'],
    until: '2026-10-10T18:00:00.000Z',
    ...overrides,
  };
}

describe('parseCsvList', () => {
  it('devuelve vacío para ausente o vacío', () => {
    expect(parseCsvList(undefined)).toEqual([]);
    expect(parseCsvList('')).toEqual([]);
  });

  it('divide y recorta', () => {
    expect(parseCsvList('a, b ,c')).toEqual(['a', 'b', 'c']);
  });
});

describe('evaluateSendPermit', () => {
  // Requisito 1: configuración ausente o inválida deniega.
  it('interruptor ausente deniega (SWITCH_MISSING)', () => {
    expect(
      evaluateSendPermit(
        policy({ enabled: undefined }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'SWITCH_MISSING' });
  });

  it('interruptor null deniega (SWITCH_MISSING)', () => {
    expect(
      evaluateSendPermit(
        policy({ enabled: null as unknown as string }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'SWITCH_MISSING' });
  });

  it.each(['true', '1', 'yes', 'on', 'ENABLED ', ' enabled', 'Enabled', ''])(
    'no interpreta truthiness: %p deniega (SWITCH_DENIED)',
    (value) => {
      expect(
        evaluateSendPermit(
          policy({ enabled: value }),
          'org-1',
          'WHATSAPP',
          NOW,
        ),
      ).toEqual({ allowed: false, reason: 'SWITCH_DENIED' });
    },
  );

  // Requisito 2: DENIED bloquea WhatsApp y SMS.
  it('DENIED bloquea WhatsApp', () => {
    expect(
      evaluateSendPermit(
        policy({ enabled: SEND_PERMIT_DENIED_TOKEN }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'SWITCH_DENIED' });
  });

  it('DENIED bloquea SMS', () => {
    expect(
      evaluateSendPermit(
        policy({ enabled: SEND_PERMIT_DENIED_TOKEN, allowedChannels: ['SMS'] }),
        'org-1',
        'SMS',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'SWITCH_DENIED' });
  });

  it('política totalmente vacía deniega', () => {
    expect(
      evaluateSendPermit(
        {
          enabled: undefined,
          allowedOrganizations: [],
          allowedChannels: [],
          until: undefined,
        },
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'SWITCH_MISSING' });
  });

  // Requisito 3: organización no autorizada queda bloqueada.
  it('organización fuera de la allowlist deniega (ORG_NOT_ALLOWED)', () => {
    expect(evaluateSendPermit(policy(), 'org-otra', 'WHATSAPP', NOW)).toEqual({
      allowed: false,
      reason: 'ORG_NOT_ALLOWED',
    });
  });

  it('allowlist vacía deniega', () => {
    expect(
      evaluateSendPermit(
        policy({ allowedOrganizations: [] }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'ORG_NOT_ALLOWED' });
  });

  it('organización ausente deniega (ORG_MISSING)', () => {
    expect(evaluateSendPermit(policy(), null, 'WHATSAPP', NOW)).toEqual({
      allowed: false,
      reason: 'ORG_MISSING',
    });
    expect(evaluateSendPermit(policy(), undefined, 'WHATSAPP', NOW)).toEqual({
      allowed: false,
      reason: 'ORG_MISSING',
    });
  });

  it('canal fuera de la allowlist deniega (CHANNEL_NOT_ALLOWED)', () => {
    expect(
      evaluateSendPermit(
        policy({ allowedChannels: ['SMS'] }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'CHANNEL_NOT_ALLOWED' });
  });

  // Requisito 4: fecha ausente, inválida o vencida deniega.
  it('ventana ausente deniega (WINDOW_MISSING)', () => {
    expect(
      evaluateSendPermit(
        policy({ until: undefined }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'WINDOW_MISSING' });
    expect(
      evaluateSendPermit(policy({ until: '' }), 'org-1', 'WHATSAPP', NOW),
    ).toEqual({
      allowed: false,
      reason: 'WINDOW_MISSING',
    });
  });

  it('ventana inválida deniega (WINDOW_INVALID)', () => {
    expect(
      evaluateSendPermit(
        policy({ until: 'no-es-una-fecha' }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'WINDOW_INVALID' });
  });

  it('ventana vencida deniega (WINDOW_EXPIRED)', () => {
    expect(
      evaluateSendPermit(
        policy({ until: '2026-10-10T14:59:59.000Z' }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'WINDOW_EXPIRED' });
  });

  it('ventana expirando en este mismo instante deniega', () => {
    expect(
      evaluateSendPermit(
        policy({ until: NOW.toISOString() }),
        'org-1',
        'WHATSAPP',
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'WINDOW_EXPIRED' });
  });

  // Permiso concedido.
  it('autorización completa concede permiso', () => {
    expect(evaluateSendPermit(policy(), 'org-1', 'WHATSAPP', NOW)).toEqual({
      allowed: true,
    });
  });

  it('SMS con canal y org autorizados concede permiso', () => {
    expect(
      evaluateSendPermit(
        policy({ allowedChannels: ['WHATSAPP', 'SMS'] }),
        'org-1',
        'SMS',
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it('un canal desconocido deniega', () => {
    expect(
      evaluateSendPermit(
        policy({ allowedChannels: ['EMAIL'] }),
        'org-1',
        'EMAIL' as never,
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'CHANNEL_NOT_ALLOWED' });
  });
});

describe('SendBlockedError', () => {
  it('transporta motivo y canal sin filtrar datos del cliente', () => {
    const error = new SendBlockedError('ORG_NOT_ALLOWED', 'WHATSAPP');
    expect(error.denialReason).toBe('ORG_NOT_ALLOWED');
    expect(error.channel).toBe('WHATSAPP');
    expect(error.message).not.toMatch(/\+?\d{7,}/);
  });
});
