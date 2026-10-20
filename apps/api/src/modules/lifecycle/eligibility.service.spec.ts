import { Test, TestingModule } from '@nestjs/testing';
import { MessageType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  DEFAULT_WEEKLY_WINDOWS,
  EligibilityService,
  SUNDAY_0200_EXCEPTION,
  isSundayTwoAm,
} from './eligibility.service';

const TZ = 'America/Bogota'; // UTC-5 fijo, sin DST

/**
 * Instante de referencia de los tests. Los gates de frecuencia y silencio
 * operan sobre "ahora", así que todos los fixtures deben derivar de aquí:
 * mezclar una fecha fija con Date.now() descuadra la aritmética de días.
 */
const NOW = new Date();

/**
 * Devuelve un instante que cae en el día de la semana indicado (0 = domingo)
 * a la hora local de Bogotá, dentro de la semana de NOW.
 */
function local(dayOfWeek: number, hh: number, mm = 0): Date {
  const at = new Date(NOW);
  const currentDay = at.getUTCDay();
  const delta = (dayOfWeek - currentDay + 7) % 7;
  at.setUTCDate(at.getUTCDate() + delta);
  // +5h para pasar de UTC a Bogotá (UTC-5 sin DST en esta semana).
  at.setUTCHours(hh + 5, mm, 0, 0);
  return at;
}

/** Días transcurridos desde NOW, como los ve el servicio. */
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * 86_400_000);

/**
 * Responde al findFirst de `messages` según el tipo que el gate consulta.
 * `dias` es "hace cuántos días se envió"; null = nunca.
 */
function answerLastSent(
  prisma: { message: { findFirst: jest.Mock } },
  porTipo: Partial<Record<string, number | null>>,
): void {
  prisma.message.findFirst.mockImplementation(
    (args: { where: { type: string } }) => {
      const dias = porTipo[args.where.type];
      return Promise.resolve(
        dias === null || dias === undefined ? null : { sentAt: daysAgo(dias) },
      );
    },
  );
}

describe('EligibilityService', () => {
  let service: EligibilityService;
  let prisma: {
    customer: { findUnique: jest.Mock };
    commercialCycle: { findUnique: jest.Mock };
    lifecycleConsent: { findFirst: jest.Mock };
    message: { findFirst: jest.Mock };
  };

  const input = (overrides: Record<string, unknown> = {}) => ({
    customerId: 'cu-1',
    organizationId: 'org-1',
    timeZone: TZ,
    now: NOW,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ noContactAt: null }),
      },
      commercialCycle: {
        findUnique: jest.fn().mockResolvedValue({
          startDate: new Date('2026-01-15T12:00:00Z'),
          lifecyclePausedAt: null,
        }),
      },
      lifecycleConsent: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EligibilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EligibilityService);
  });

  // -------------------------------------------------------------------------
  // Composición: G3 + G4 + G1 (requisito explícito de la misión)
  // -------------------------------------------------------------------------
  describe('composición G3 + G4 + G1', () => {
    it('los tres pasan: envía', async () => {
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res).toEqual({ allowed: true, deferrable: false });
    });

    it('G3 bloquea cuando hubo un AUTOMATIC hace 14 días', async () => {
      prisma.message.findFirst.mockResolvedValue({
        sentAt: local(1, 10, 0) === null ? null : daysAgo(14),
      });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.allowed).toBe(false);
      expect(res.blockedBy).toBe('G3');
      expect(res.deferrable).toBe(false);
    });

    it('G4 bloquea cuando hubo un MANUAL hace 6 días, aunque G3 pase', async () => {
      answerLastSent(prisma, { MANUAL: 6 });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.blockedBy).toBe('G4');
    });

    // TASK 1: reloj controlado (miércoles 2026-09-30 10:00 Bogotá, en ventana
    // Lun–Vie 08:00–19:30). No usa NOW ni local(): estas pruebas pasan igual
    // cualquier día del año. Sin cycleId para aislar G3/G4 de G1/G7/G8.
    describe('TASK 1 · G3/G4 consultan por customerId (reloj fijo)', () => {
      // 2026-09-30 es miércoles. 15:00Z = 10:00 en Bogotá (UTC-5, sin DST).
      const FIXED_NOW = new Date('2026-09-30T15:00:00.000Z');

      function fixedSentAt(daysAgo: number): Date {
        return new Date(FIXED_NOW.getTime() - daysAgo * 86_400_000);
      }

      it('G3 bloquea un AUTOMATIC de hace 8 días del mismo cliente', async () => {
        prisma.message.findFirst.mockImplementation(
          (args: { where: { type: string } }) =>
            Promise.resolve(
              args.where.type === 'AUTOMATIC'
                ? { sentAt: fixedSentAt(8) }
                : null,
            ),
        );
        const res = await service.evaluate(
          input({ now: FIXED_NOW, timeZone: TZ }),
        );
        expect(res.allowed).toBe(false);
        expect(res.blockedBy).toBe('G3');
        expect(res.deferrable).toBe(false);
      });

      it('G3 consulta el frequency por el customerId evaluado', async () => {
        prisma.message.findFirst.mockResolvedValue(null);
        await service.evaluate(input({ now: FIXED_NOW, timeZone: TZ }));
        const calls = prisma.message.findFirst.mock.calls.map(
          (call: Array<{ where: Record<string, unknown> }>) => call[0].where,
        );
        expect(calls.length).toBeGreaterThan(0);
        // G4 consulta MANUAL y G3 consulta AUTOMATIC: ambas por cliente.
        for (const where of calls) {
          expect(where.customerId).toBe('cu-1');
        }
      });

      it('G4 bloquea un MANUAL de hace 3 días del mismo cliente', async () => {
        prisma.message.findFirst.mockImplementation(
          (args: { where: { type: string } }) =>
            Promise.resolve(
              args.where.type === 'MANUAL' ? { sentAt: fixedSentAt(3) } : null,
            ),
        );
        const res = await service.evaluate(
          input({ now: FIXED_NOW, timeZone: TZ }),
        );
        expect(res.allowed).toBe(false);
        expect(res.blockedBy).toBe('G4');
      });

      it('G4 consulta el silencio por el customerId evaluado', async () => {
        prisma.message.findFirst.mockImplementation(
          (args: { where: { type: string } }) =>
            Promise.resolve(
              args.where.type === 'MANUAL' ? { sentAt: fixedSentAt(3) } : null,
            ),
        );
        await service.evaluate(input({ now: FIXED_NOW, timeZone: TZ }));
        const manualCall = prisma.message.findFirst.mock.calls
          .map(
            (call: Array<{ where: Record<string, unknown> }>) => call[0].where,
          )
          .find((where) => where.type === 'MANUAL');
        expect(manualCall).toBeDefined();
        expect(manualCall?.customerId).toBe('cu-1');
      });
    });

    it('G1 (pausa) gana sobre frecuencia y silencio: es el primero', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        startDate: new Date('2026-01-15T12:00:00Z'),
        lifecyclePausedAt: new Date(),
      });
      prisma.message.findFirst.mockResolvedValue({
        sentAt: daysAgo(2),
      });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.blockedBy).toBe('G1');
    });

    it('G2 (opt-out) gana sobre todo lo demás', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        noContactAt: new Date(),
      });
      prisma.commercialCycle.findUnique.mockResolvedValue({
        startDate: new Date('2026-01-15T12:00:00Z'),
        lifecyclePausedAt: new Date(),
      });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.blockedBy).toBe('G2');
    });
  });

  // -------------------------------------------------------------------------
  // G3 — bordes exactos (§4.1)
  // -------------------------------------------------------------------------
  describe('G3 · frecuencia global (§4.1)', () => {
    it('sin envíos previos nunca bloquea', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(
        service.checkAutomaticFrequency('cu-1', NOW),
      ).resolves.toMatchObject({ allowed: true });
    });

    it('exactamente 15 días bloquea', async () => {
      prisma.message.findFirst.mockResolvedValue({ sentAt: daysAgo(15) });
      await expect(
        service.checkAutomaticFrequency('cu-1', NOW),
      ).resolves.toMatchObject({ blockedBy: 'G3' });
    });

    it('menos de 15 días bloquea', async () => {
      for (const d of [0, 1, 7, 14]) {
        prisma.message.findFirst.mockResolvedValue({ sentAt: daysAgo(d) });
        await expect(
          service.checkAutomaticFrequency('cu-1', NOW),
        ).resolves.toMatchObject({ blockedBy: 'G3' });
      }
    });

    it('más de 15 días permite (día 16 es el primero elegible)', async () => {
      prisma.message.findFirst.mockResolvedValue({ sentAt: daysAgo(16) });
      await expect(
        service.checkAutomaticFrequency('cu-1', NOW),
      ).resolves.toMatchObject({ allowed: true });
    });

    it('cuenta por sentAt, no por createdAt', async () => {
      await service.checkAutomaticFrequency('cu-1', NOW);
      const arg = prisma.message.findFirst.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: Record<string, unknown>;
        select: Record<string, unknown>;
      };
      expect(arg.where.sentAt).toEqual({ not: null });
      expect(arg.orderBy).toEqual({ sentAt: 'desc' });
    });

    it('filtra AUTOMATIC + OUTBOUND: no cuenta MANUAL ni INCOMING', async () => {
      await service.checkAutomaticFrequency('cu-1', NOW);
      const arg = prisma.message.findFirst.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where.type).toBe(MessageType.AUTOMATIC);
      expect(arg.where.direction).toBe('OUTBOUND');
    });
  });

  // -------------------------------------------------------------------------
  // G4 — bordes exactos (§4.2)
  // -------------------------------------------------------------------------
  describe('G4 · silencio manual (§4.2)', () => {
    it('sin mensajes manuales nunca bloquea', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(
        service.checkManualSilence('cu-1', NOW),
      ).resolves.toMatchObject({ allowed: true });
    });

    it('dentro de 7 días bloquea', async () => {
      for (const d of [0, 3, 6]) {
        prisma.message.findFirst.mockResolvedValue({ sentAt: daysAgo(d) });
        await expect(
          service.checkManualSilence('cu-1', NOW),
        ).resolves.toMatchObject({ blockedBy: 'G4' });
      }
    });

    it('al día 8 permite', async () => {
      prisma.message.findFirst.mockResolvedValue({ sentAt: daysAgo(8) });
      await expect(
        service.checkManualSilence('cu-1', NOW),
      ).resolves.toMatchObject({ allowed: true });
    });

    it('considera el MANUAL más reciente, no el más antiguo', async () => {
      await service.checkManualSilence('cu-1', NOW);
      const arg = prisma.message.findFirst.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: Record<string, unknown>;
      };
      expect(arg.where.type).toBe(MessageType.MANUAL);
      expect(arg.orderBy).toEqual({ sentAt: 'desc' });
    });
  });

  // -------------------------------------------------------------------------
  // G5/G6 — ventanas y excepción del domingo (§4.4)
  // -------------------------------------------------------------------------
  describe('G5/G6 · ventanas (§4.4)', () => {
    it('lunes 08:00 y 19:30 dentro de la ventana', async () => {
      for (const [hh, mm] of [
        [8, 0],
        [19, 30],
      ] as const) {
        const res = await service.evaluate(
          input({ now: local(1, hh, mm), cycleId: 'cy-1' }),
        );
        expect(res.allowed).toBe(true);
      }
    });

    it('lunes 07:59 y 19:31 fuera de la ventana', async () => {
      for (const [hh, mm] of [
        [7, 59],
        [19, 31],
      ] as const) {
        const res = await service.evaluate(
          input({ now: local(1, hh, mm), cycleId: 'cy-1' }),
        );
        expect(res.blockedBy).toBe('G5');
        expect(res.deferrable).toBe(true);
      }
    });

    it('sábado 08:00 fuera pero 08:45 dentro (ventana propia)', async () => {
      const fuera = await service.evaluate(
        input({ now: local(6, 8, 0), cycleId: 'cy-1' }),
      );
      expect(fuera.blockedBy).toBe('G5');

      const dentro = await service.evaluate(
        input({ now: local(6, 8, 45), cycleId: 'cy-1' }),
      );
      expect(dentro.allowed).toBe(true);
    });

    it('sábado 18:01 queda fuera (no es la excepción del lunes)', async () => {
      const res = await service.evaluate(
        input({ now: local(6, 18, 1), cycleId: 'cy-1' }),
      );
      expect(res.blockedBy).toBe('G5');
    });

    it('domingo nunca permite envíos programados', async () => {
      for (const [hh, mm] of [
        [10, 0],
        [15, 0],
        [23, 0],
      ] as const) {
        const res = await service.evaluate(
          input({ now: local(0, hh, mm), cycleId: 'cy-1' }),
        );
        expect(res.blockedBy).toBe('G5');
        expect(res.deferrable).toBe(true);
      }
    });

    it('festivo bloquea aunque sea día laborable', async () => {
      const monday = local(1, 10);
      const res = await service.evaluate(
        input({
          now: monday,
          cycleId: 'cy-1',
          holidays: ['2026-10-05'],
        }),
      );
      expect(res.blockedBy).toBe('G6');
      expect(res.deferrable).toBe(true);
    });

    it('el cliente puede escribir en domingo: la respuesta instantánea pasa', async () => {
      const res = await service.evaluate(
        input({ now: local(0, 15, 0), cycleId: 'cy-1', instantReply: true }),
      );
      expect(res.allowed).toBe(true);
    });

    it('pero la respuesta instantánea sí respeta el opt-out', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        noContactAt: new Date(),
      });
      const res = await service.evaluate(
        input({ now: local(0, 15, 0), cycleId: 'cy-1', instantReply: true }),
      );
      expect(res.blockedBy).toBe('G2');
    });

    it('y la respuesta instantánea no consume la frecuencia', async () => {
      prisma.message.findFirst.mockResolvedValue({
        sentAt: daysAgo(2),
      });
      const res = await service.evaluate(
        input({ now: local(1, 10), cycleId: 'cy-1', instantReply: true }),
      );
      expect(res.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Excepción del domingo 02:00 (§4.4)
  // -------------------------------------------------------------------------
  describe('excepción domingo 02:00 → lunes 12:15 (§4.4)', () => {
    it('detecta el caso exacto del domingo a las 02:00', () => {
      expect(isSundayTwoAm(0, 120)).toBe(true);
      expect(isSundayTwoAm(0, 121)).toBe(false);
      expect(isSundayTwoAm(1, 120)).toBe(false);
    });

    it('el caso está bloqueado en domingo (se desplaza a lunes 12:15)', async () => {
      const res = await service.evaluate(
        input({ now: local(0, 2, 0), cycleId: 'cy-1' }),
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('lunes 12:15');
    });

    it('lunes 12:15 cae dentro de la ventana normal del lunes', () => {
      expect(DEFAULT_WEEKLY_WINDOWS[1]).toEqual({
        startMinutes: 480,
        endMinutes: 1170,
      });
      expect(SUNDAY_0200_EXCEPTION.toMinutes).toBe(735);
      expect(
        SUNDAY_0200_EXCEPTION.toMinutes <=
          (DEFAULT_WEEKLY_WINDOWS[1]?.endMinutes ?? 0),
      ).toBe(true);
    });

    it('lunes a otra hora sigue la lógica general, no la excepción', async () => {
      const manana = await service.evaluate(
        input({ now: local(1, 8, 0), cycleId: 'cy-1' }),
      );
      expect(manana.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // G1 / G7 / G8
  // -------------------------------------------------------------------------
  describe('G1, G7 y G8', () => {
    it('G8 bloquea si el ciclo no tiene fecha base de compra', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        startDate: null,
        lifecyclePausedAt: null,
      });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.blockedBy).toBe('G8');
      expect(res.deferrable).toBe(true);
    });

    // Decisión aprobada: la instalación ya NO es requisito de elegibilidad.
    it('G8 permite un ciclo cuya compra no tiene fecha de instalación', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        startDate: new Date('2026-01-15T12:00:00Z'),
        lifecyclePausedAt: null,
      });
      const res = await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(res.blockedBy).not.toBe('G8');
    });

    it('G7 solo se consulta si la etapa es de mantenimiento', async () => {
      await service.evaluate(input({ cycleId: 'cy-1' }));
      expect(prisma.lifecycleConsent.findFirst).not.toHaveBeenCalled();

      await service.evaluate(
        input({ cycleId: 'cy-1', requiresMaintenanceConsent: true }),
      );
      expect(prisma.lifecycleConsent.findFirst).toHaveBeenCalled();
    });

    it('G7 bloquea sin consentimiento y permite con GRANTED', async () => {
      prisma.lifecycleConsent.findFirst.mockResolvedValue(null);
      const sinConsent = await service.evaluate(
        input({ cycleId: 'cy-1', requiresMaintenanceConsent: true }),
      );
      expect(sinConsent.blockedBy).toBe('G7');

      prisma.lifecycleConsent.findFirst.mockResolvedValue({
        decision: 'GRANTED',
      });
      const conConsent = await service.evaluate(
        input({ cycleId: 'cy-1', requiresMaintenanceConsent: true }),
      );
      expect(conConsent.allowed).toBe(true);
    });

    it('G7 con REFUSED bloquea (rechazar no habilita)', async () => {
      prisma.lifecycleConsent.findFirst.mockResolvedValue({
        decision: 'REFUSED',
      });
      const res = await service.evaluate(
        input({ cycleId: 'cy-1', requiresMaintenanceConsent: true }),
      );
      expect(res.blockedBy).toBe('G7');
    });
  });

  // -------------------------------------------------------------------------
  // §5 prioridad: solo desempata, no salta el gate
  // -------------------------------------------------------------------------
  describe('prioridad entre colisiones (§5)', () => {
    it('vencimiento gana a mantenimiento consentido', () => {
      expect(
        service.resolveCollision('WARRANTY_EXPIRY', 'MAINTENANCE_CONSENTED'),
      ).toBe(true);
    });

    it('mantenimiento consentido gana a resto', () => {
      expect(service.resolveCollision('MAINTENANCE_CONSENTED', 'OTHER')).toBe(
        true,
      );
    });

    it('resto no gana', () => {
      expect(service.resolveCollision('OTHER', 'WARRANTY_EXPIRY')).toBe(false);
    });

    it('la prioridad no salta G3: sigue bloqueando', async () => {
      answerLastSent(prisma, { AUTOMATIC: 4 });
      const res = await service.evaluate(
        input({ cycleId: 'cy-1', category: 'WARRANTY_EXPIRY' }),
      );
      expect(res.blockedBy).toBe('G3');
    });
  });
});
