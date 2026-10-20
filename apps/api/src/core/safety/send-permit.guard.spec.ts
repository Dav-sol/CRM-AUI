import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { SendPermitGuard } from './send-permit.guard';
import { SEND_PERMIT_ENABLED_TOKEN, SendBlockedError } from './send-permit';

const NOW = new Date('2026-10-10T15:00:00.000Z');

async function build(configService: ConfigService): Promise<SendPermitGuard> {
  const module = await Test.createTestingModule({
    providers: [
      SendPermitGuard,
      { provide: ConfigService, useValue: configService },
    ],
  }).compile();
  return module.get(SendPermitGuard);
}

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const ENABLED = {
  'safety.sendEnabled': SEND_PERMIT_ENABLED_TOKEN,
  'safety.allowedOrganizationsCsv': 'org-1',
  'safety.allowedChannelsCsv': 'WHATSAPP,SMS',
  'safety.sendUntil': '2026-10-10T18:00:00.000Z',
};

describe('SendPermitGuard', () => {
  describe('evaluate', () => {
    it('concede con configuración completa', async () => {
      const guard = await build(configWith(ENABLED));
      expect(guard.evaluate('org-1', 'WHATSAPP', NOW)).toEqual({
        allowed: true,
      });
    });

    it('con ConfigService que lanza, deniega y nunca propaga el error', async () => {
      const exploding = {
        get: jest.fn(() => {
          throw new Error('config unavailable');
        }),
      } as unknown as ConfigService;
      const guard = await build(exploding);
      const decision = guard.evaluate('org-1', 'WHATSAPP', NOW);
      expect(decision.allowed).toBe(false);
    });

    it('deniega cuando nada está configurado', async () => {
      const guard = await build(configWith({}));
      expect(guard.evaluate('org-1', 'WHATSAPP', NOW)).toEqual({
        allowed: false,
        reason: 'SWITCH_MISSING',
      });
    });
  });

  describe('assert', () => {
    it('no lanza cuando el permiso es válido', async () => {
      const guard = await build(configWith(ENABLED));
      expect(() => guard.assert('org-1', 'WHATSAPP', NOW)).not.toThrow();
      expect(() => guard.assert('org-1', 'SMS', NOW)).not.toThrow();
    });

    it('lanza SendBlockedError con organización no autorizada', async () => {
      const guard = await build(configWith(ENABLED));
      expect(() => guard.assert('org-x', 'WHATSAPP', NOW)).toThrow(
        SendBlockedError,
      );
    });

    it('lanza SendBlockedError con interruptor truthy pero inválido', async () => {
      const guard = await build(
        configWith({ ...ENABLED, 'safety.sendEnabled': 'true' }),
      );
      expect(() => guard.assert('org-1', 'WHATSAPP', NOW)).toThrow(
        SendBlockedError,
      );
    });

    it('el motivo viaja en la excepción', async () => {
      const guard = await build(
        configWith({ ...ENABLED, 'safety.sendEnabled': 'DENIED' }),
      );
      try {
        guard.assert('org-1', 'WHATSAPP', NOW);
        throw new Error('debería haber lanzado');
      } catch (error) {
        expect(error).toBeInstanceOf(SendBlockedError);
        expect((error as SendBlockedError).denialReason).toBe('SWITCH_DENIED');
      }
    });
  });

  describe('status', () => {
    it('expone agregados sin allowlist ni credenciales', async () => {
      const guard = await build(configWith(ENABLED));
      const status = guard.status(NOW);
      expect(status.allowedOrganizationCount).toBe(1);
      expect(status.allowedChannels).toEqual(['WHATSAPP', 'SMS']);
      expect(status.expiresAt).toBe('2026-10-10T18:00:00.000Z');
      expect(JSON.stringify(status)).not.toContain('org-1');
    });

    it('con política denegada reporta el motivo real', async () => {
      const guard = await build(configWith({}));
      const status = guard.status(NOW);
      expect(status.allowed).toBe(false);
      expect(status.reason).toBe('SWITCH_MISSING');
    });
  });

  describe('validateStartup', () => {
    it('no reporta problemas con política denegada', async () => {
      const guard = await build(configWith({}));
      expect(guard.validateStartup()).toEqual([]);
    });

    it('reporta ENABLED sin allowlist de organizaciones', async () => {
      const guard = await build(
        configWith({ ...ENABLED, 'safety.allowedOrganizationsCsv': '' }),
      );
      expect(guard.validateStartup()).toContainEqual(
        expect.stringContaining('OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS'),
      );
    });

    it('reporta ENABLED sin canales', async () => {
      const guard = await build(
        configWith({ ...ENABLED, 'safety.allowedChannelsCsv': '' }),
      );
      expect(guard.validateStartup()).toContainEqual(
        expect.stringContaining('OUTBOUND_SEND_ALLOWED_CHANNELS'),
      );
    });

    it('reporta ENABLED sin ventana y con ventana vencida', async () => {
      const sinVentana = await build(
        configWith({ ...ENABLED, 'safety.sendUntil': undefined }),
      );
      expect(sinVentana.validateStartup()).toContainEqual(
        expect.stringContaining('OUTBOUND_SEND_UNTIL is missing'),
      );

      const vencida = await build(
        configWith({
          ...ENABLED,
          'safety.sendUntil': '2020-01-01T00:00:00.000Z',
        }),
      );
      expect(vencida.validateStartup()).toContainEqual(
        expect.stringContaining('already expired'),
      );
    });

    it('no reporta problemas con ENABLED completo y vigente', async () => {
      const guard = await build(
        configWith({
          ...ENABLED,
          'safety.sendUntil': '2999-01-01T00:00:00.000Z',
        }),
      );
      expect(guard.validateStartup()).toEqual([]);
    });
  });
});
