import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SmsScheduler } from './sms-scheduler';
import { SmsExecutionService } from './sms-execution.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { SMS_PROVIDER } from './sms-provider.interface';

/**
 * Política B (spec 017 Q8/A8 enmendada, 2026-10-26) aplicada al canal SMS.
 *
 * Contrato: un fallo **terminal** deja la automatización en `ERROR` con
 * `retryCount = MAX_AUTOMATION_RETRIES` en el primer intento, de modo que el
 * filtro del scheduler (`sms-scheduler.ts:85`, `retryCount: { lt: MAX }`) no la
 * vuelva a elegir. Un fallo **recuperable** conserva la política acotada:
 * incrementa `retryCount` y sigue elegible mientras `retryCount < MAX`.
 *
 * Los dobles son en memoria: ninguna prueba de este archivo toca base de datos,
 * red ni proveedor real. El scheduler se ejercita de verdad (`tick()`) contra un
 * Prisma falso que aplica el mismo `where` que `sms-scheduler.ts:79-96`, de forma
 * que «no se vuelve a elegir» es observable y no una suposición.
 */

const MAX_AUTOMATION_RETRIES = 3;

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  deletedAt: Date | null;
  noContactAt: Date | null;
};

type AutomationRow = {
  id: string;
  uuid: string;
  organizationId: string;
  channel: string;
  status: string;
  retryCount: number;
  scheduledDate: Date;
  deletedAt: Date | null;
  campaignId: string | null;
  purpose: string;
  updatedAt: Date;
  messageTemplate: string | null;
  purchase: {
    deletedAt: Date | null;
    customer: CustomerRow;
    product: { name: string } | null;
  };
  organization: { name: string };
  campaign: { template: string } | null;
};

type Where = {
  id?: string;
  channel?: string;
  status?: { in?: string[] };
  retryCount?: { lt?: number };
  scheduledDate?: { lte?: Date };
  updatedAt?: { lt?: Date };
  deletedAt?: Date | null;
};

function makeAutomation(overrides: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: 'a-1',
    uuid: 'a-uuid-1',
    organizationId: 'org-1',
    channel: 'SMS',
    status: 'SCHEDULED',
    retryCount: 0,
    scheduledDate: new Date(Date.now() - 60_000),
    deletedAt: null,
    campaignId: null,
    purpose: 'TRANSACTIONAL',
    updatedAt: new Date(Date.now() - 60_000),
    messageTemplate: 'Hola {customerName}',
    purchase: {
      deletedAt: null,
      customer: {
        id: 'c-1',
        name: 'Juan Perez',
        phone: '573000000000',
        status: 'ACTIVE',
        deletedAt: null,
        noContactAt: null,
      },
      product: { name: 'Lavadora' },
    },
    organization: { name: 'Org Uno' },
    campaign: null,
    ...overrides,
  };
}

type PrismaFake = {
  automation: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  message: { create: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

function makePrisma(rows: AutomationRow[]): PrismaFake {
  // Aplica el `where` del scheduler (sms-scheduler.ts:79-96) y del resto de
  // consultas del servicio sobre el almacén en memoria.
  const matches = (row: AutomationRow, where: Where): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.channel !== undefined && row.channel !== where.channel) {
      return false;
    }
    if (where.status?.in && !where.status.in.includes(row.status)) {
      return false;
    }
    if (
      where.retryCount?.lt !== undefined &&
      !(row.retryCount < where.retryCount.lt)
    ) {
      return false;
    }
    if (
      where.scheduledDate?.lte &&
      !(row.scheduledDate <= where.scheduledDate.lte)
    ) {
      return false;
    }
    if (where.updatedAt?.lt && !(row.updatedAt < where.updatedAt.lt)) {
      return false;
    }
    if (where.deletedAt === null && row.deletedAt !== null) return false;
    return true;
  };

  const apply = (row: AutomationRow, data: Record<string, unknown>): void => {
    if (typeof data.status === 'string') row.status = data.status;
    const retry = data.retryCount as
      number | { increment?: number } | undefined;
    if (typeof retry === 'number') {
      row.retryCount = retry;
    } else if (retry?.increment !== undefined) {
      row.retryCount += retry.increment;
    }
  };

  const api = {} as PrismaFake;
  api.automation = {
    findMany: jest.fn(({ where }: { where: Where }) =>
      rows
        .filter((row) => matches(row, where))
        .map((row) => ({ id: row.id, purpose: row.purpose })),
    ),
    findUnique: jest.fn(({ where }: { where: Where }) => {
      return rows.find((row) => row.id === where.id) ?? null;
    }),
    update: jest.fn(
      ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('row not found');
        apply(row, data);
        return row;
      },
    ),
    updateMany: jest.fn(
      ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return { count: hit.length };
      },
    ),
  };
  api.message = {
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => ({
      id: 'm-1',
      uuid: 'm-uuid-1',
      ...data,
    })),
    update: jest.fn(() => ({})),
  };
  api.$transaction = jest.fn(async (fn: (tx: PrismaFake) => Promise<unknown>) =>
    fn(api),
  );

  return api;
}

describe('SmsExecutionService · política B (spec 017 Q8/A8, 2026-10-26)', () => {
  let scheduler: SmsScheduler;
  let rows: AutomationRow[];
  let prisma: ReturnType<typeof makePrisma>;
  let providerSend: jest.Mock;
  let auditRecord: jest.Mock;
  let emitterEmit: jest.Mock;

  const emittedNames = (): string[] =>
    (emitterEmit.mock.calls as [string, unknown][]).map((call) => call[0]);

  async function build(automation: AutomationRow): Promise<void> {
    rows = [automation];
    prisma = makePrisma(rows);
    providerSend = jest.fn();
    auditRecord = jest.fn().mockResolvedValue(undefined);
    emitterEmit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsScheduler,
        SmsExecutionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.environment') return 'production';
              if (key === 'sms.sender') return 'SMS-TEST';
              if (key === 'sms.executingTimeoutMs') return 600_000;
              if (key === 'sms.commercialQuietHoursStart') return 20;
              if (key === 'sms.commercialQuietHoursEnd') return 9;
              if (key === 'sms.timezone') return 'America/Bogota';
              return null;
            }),
          },
        },
        {
          provide: SendPermitGuard,
          useValue: { evaluate: () => ({ allowed: true }) },
        },
        {
          provide: SMS_PROVIDER,
          useValue: { send: providerSend, getName: () => 'fake' },
        },
        { provide: AuditIdentityService, useValue: { record: auditRecord } },
        { provide: EventEmitter2, useValue: { emit: emitterEmit } },
      ],
    }).compile();

    scheduler = module.get(SmsScheduler);
  }

  describe('fallo determinista — customer_no_phone', () => {
    beforeEach(async () => {
      await build(
        makeAutomation({
          purchase: {
            deletedAt: null,
            customer: {
              id: 'c-1',
              name: 'Sin Telefono',
              phone: null,
              status: 'ACTIVE',
              deletedAt: null,
              noContactAt: null,
            },
            product: { name: 'Lavadora' },
          },
        }),
      );
    });

    it('deja ERROR con retryCount = MAX en el primer fallo', async () => {
      await scheduler.tick();

      expect(rows[0].status).toBe('ERROR');
      expect(rows[0].retryCount).toBe(MAX_AUTOMATION_RETRIES);
    });

    it('no crea fila de mensaje ni llama al proveedor', async () => {
      await scheduler.tick();

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(providerSend).not.toHaveBeenCalled();
    });

    it('emite AutomationFailed una sola vez', async () => {
      await scheduler.tick();

      expect(
        emittedNames().filter((name) => name === 'AutomationFailed'),
      ).toHaveLength(1);
    });

    it('no se vuelve a elegir: un solo intento aunque pasen más ticks', async () => {
      await scheduler.tick();
      await scheduler.tick();
      await scheduler.tick();

      // Sin el fix esto son 3 intentos y 3 AutomationFailed, porque el
      // scheduler re-elige cualquier fila con retryCount < MAX.
      expect(auditRecord).toHaveBeenCalledTimes(1);
      expect(
        emittedNames().filter((name) => name === 'AutomationFailed'),
      ).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'ERROR',
        retryCount: MAX_AUTOMATION_RETRIES,
      });
    });
  });

  describe('fallo recuperable — provider_error', () => {
    beforeEach(async () => {
      await build(makeAutomation());
      providerSend.mockRejectedValue(new Error('provider down'));
    });

    it('incrementa retryCount y sigue elegible mientras < MAX', async () => {
      await scheduler.tick();
      expect(rows[0]).toMatchObject({ status: 'ERROR', retryCount: 1 });

      await scheduler.tick();
      expect(rows[0]).toMatchObject({ status: 'ERROR', retryCount: 2 });
      expect(providerSend).toHaveBeenCalledTimes(2);
    });

    it('agota el presupuesto en MAX intentos y entonces deja de elegirse', async () => {
      for (let tick = 0; tick < 5; tick++) {
        await scheduler.tick();
      }

      // Política previa intacta: 3 intentos (retryCount 1, 2 y 3), no más.
      expect(providerSend).toHaveBeenCalledTimes(MAX_AUTOMATION_RETRIES);
      expect(rows[0]).toMatchObject({
        status: 'ERROR',
        retryCount: MAX_AUTOMATION_RETRIES,
      });
    });

    it('marca el mensaje como FAILED con el motivo del proveedor', async () => {
      await scheduler.tick();

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { status: 'FAILED', failureReason: 'provider down' },
      });
    });
  });

  describe('empty_content — configuración, no dato del cliente', () => {
    beforeEach(async () => {
      await build(makeAutomation({ messageTemplate: null, campaign: null }));
    });

    it('conserva la política acotada: incrementa y no se declara terminal', async () => {
      // Política B reserva el estado terminal para fallos deterministas del
      // dato del cliente (customer_no_phone). `empty_content` depende de una
      // plantilla que un operador puede corregir entre ticks, y la spec
      // enmendada no lo clasifica como terminal; se mantiene el reintento
      // acotado en lugar de inventar una regla de negocio.
      await scheduler.tick();

      expect(rows[0]).toMatchObject({ status: 'ERROR', retryCount: 1 });
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(providerSend).not.toHaveBeenCalled();
    });

    it('deja de reintentar al agotar MAX', async () => {
      for (let tick = 0; tick < 5; tick++) {
        await scheduler.tick();
      }

      expect(rows[0]).toMatchObject({
        status: 'ERROR',
        retryCount: MAX_AUTOMATION_RETRIES,
      });
      expect(auditRecord).toHaveBeenCalledTimes(MAX_AUTOMATION_RETRIES);
    });
  });
});
