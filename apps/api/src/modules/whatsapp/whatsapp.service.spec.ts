import {
  BadGatewayException,
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { ConfiguracionesService } from '../configuraciones/configuraciones.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';
import { SendBlockedError } from '../../core/safety/send-permit';
import { EligibilityService } from '../lifecycle/eligibility.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { WhatsappService } from './whatsapp.service';
import { PancakeWhatsAppProvider } from './pancake/pancake-whatsapp.provider';
import {
  PancakeApiError,
  PancakeRateLimitError,
  PancakeTimeoutError,
} from './pancake/pancake.client';
import {
  ProviderSendError,
  WHATSAPP_PROVIDER,
  WhatsAppProvider,
} from './whatsapp.provider';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const now = '2026-08-17T12:00:00.000Z';

const expectData = (shape: Record<string, unknown>): Record<string, unknown> =>
  expect.objectContaining({
    data: expect.objectContaining(shape) as unknown,
  }) as Record<string, unknown>;

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: {
    automation: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    message: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    conversation: {
      findFirst: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    customer: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    organization: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let provider: { sendMessage: jest.Mock };
  let pancakeProvider: {
    sendMessage: jest.Mock;
    sendTemplate: jest.Mock;
    isConfigured: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let sendPermit: { evaluate: jest.Mock; assert: jest.Mock };
  let configuraciones: {
    dentroDeHorario: jest.Mock;
    timeZoneOrganizacion: jest.Mock;
  };
  let eligibility: { evaluate: jest.Mock };
  let lifecycle: { pause: jest.Mock; openComplaint: jest.Mock };

  const emittedNames = (): string[] =>
    eventEmitter.emit.mock.calls.map((call) => (call as string[])[0]);

  beforeEach(async () => {
    prisma = {
      automation: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'cu-auto', uuid: 'cuu-auto' }),
      },
      organization: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    provider = { sendMessage: jest.fn() };
    pancakeProvider = {
      sendMessage: jest.fn(),
      sendTemplate: jest.fn(),
      isConfigured: jest.fn(() => false),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') {
          return 'org-1';
        }
        return null;
      }),
    };
    configuraciones = {
      dentroDeHorario: jest.fn().mockResolvedValue(true),
      timeZoneOrganizacion: jest.fn().mockResolvedValue('America/Bogota'),
    };
    eligibility = {
      evaluate: jest
        .fn()
        .mockResolvedValue({ allowed: true, deferrable: false }),
    };
    lifecycle = {
      pause: jest.fn().mockResolvedValue(undefined),
      openComplaint: jest
        .fn()
        .mockResolvedValue({ id: 'cp-1', alreadyOpen: false }),
    };
    sendPermit = {
      evaluate: jest.fn(() => ({ allowed: true })),
      assert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WHATSAPP_PROVIDER, useValue: provider as WhatsAppProvider },
        { provide: PancakeWhatsAppProvider, useValue: pancakeProvider },
        { provide: ConfigService, useValue: configService },
        // AU-009: sin horario configurado, todo se ejecuta (comportamiento previo).
        { provide: ConfiguracionesService, useValue: configuraciones },
        // Gates de spec 025 §4: por defecto todo pasa; los casos que necesitan
        // un bloqueo los cubren los tests de EligibilityService.
        { provide: EligibilityService, useValue: eligibility },
        { provide: LifecycleService, useValue: lifecycle },
        // AUTO-SAFETY-002: default permissive so the pre-existing assertions
        // hold. The DENY behaviour is asserted in its own describe block below.
        { provide: SendPermitGuard, useValue: sendPermit },
      ],
    }).compile();

    service = module.get(WhatsappService);
  });

  describe('executeDueAutomations (US1, AU-005, AU-011)', () => {
    const dueAutomation = {
      id: 'a-1',
      uuid: 'au-1',
      organizationId: 'org-1',
      purchaseId: 'pu-1',
      scheduledDate: new Date(now),
      purchase: {
        purchaseDate: new Date(new Date(now).getTime() - 3 * 86_400_000),
        customer: {
          id: 'cu-1',
          uuid: 'cuu-1',
          phone: '573000000000',
          name: 'Juan Perez',
          status: 'ACTIVE',
        },
        product: { name: 'Lavadora' },
      },
      organization: { name: 'Org Uno' },
    };

    const txMock = (overrides?: {
      updateManyCount?: number;
      existingConversation?: { id: string; uuid: string } | null;
      inFlightMessage?: { id: string } | null;
    }) => ({
      // G3-02: candado `SELECT ... FOR UPDATE` sobre la fila del cliente, que
      // executeOneAutomation toma al abrir la transacción.
      $queryRaw: jest.fn().mockResolvedValue([]),
      automation: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: overrides?.updateManyCount ?? 1 }),
      },
      conversation: {
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides?.existingConversation ?? null),
        create: jest.fn().mockResolvedValue({
          id: 'conv-1',
          uuid: 'conv-uuid-1',
        }),
      },
      message: {
        // G3-01: consulta de "en vuelo" que executeOneAutomation hace antes
        // de crear el mensaje automático. `null` = no hay nada pendiente.
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides?.inFlightMessage ?? null),
        create: jest.fn().mockResolvedValue({
          id: 'msg-1',
          uuid: 'msg-uuid-1',
        }),
      },
    });

    // Un gate de elegibilidad bloqueado (specs/025-lifecycle-postventa §4) deja la
    // fila intacta: se salta SIN mutarse ni contar reintento. El gate concreto no
    // importa aquí; su comportamiento se prueba en EligibilityService.
    it('skips automations blocked by an eligibility gate without mutating them', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      eligibility.evaluate.mockResolvedValue({
        allowed: false,
        blockedBy: 'G5',
        reason: 'fuera de ventana',
        deferrable: true,
      });

      await service.executeDueAutomations();

      expect(provider.sendMessage).not.toHaveBeenCalled();
      // Sin transacción ni escritura: la fila sigue SCHEDULED con su retryCount.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it('consulta los gates con el lifecycle del cliente (no los reimplementa)', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      eligibility.evaluate.mockResolvedValue({
        allowed: true,
        deferrable: false,
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      provider.sendMessage.mockResolvedValue({ wamid: 'w-1' });

      await service.executeDueAutomations();

      expect(eligibility.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cu-1',
          organizationId: 'org-1',
          timeZone: 'America/Bogota',
        }),
      );
    });

    it('executes automations inside the business hours', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      configuraciones.dentroDeHorario.mockResolvedValue(true);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      provider.sendMessage.mockResolvedValue({ wamid: 'w-1' });

      await service.executeDueAutomations();

      expect(provider.sendMessage).toHaveBeenCalledTimes(1);
    });

    // Riesgo R1: `--pancake` quitaba WHATSAPP_SANDBOX_ORGANIZATION_IDS, y en el
    // código `usePancake` ganaba a `simulated`, así que la organización quedaba
    // sin barrera. Ahora sandbox simula siempre.
    describe('sandbox tiene prioridad sobre el proveedor (R1)', () => {
      const runWith = async (opts: {
        sandbox: string[] | null;
        pancakeOrg: string | null;
      }) => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'whatsapp.sandboxOrganizations') return opts.sandbox;
          if (key === 'pancake.organizationId') return opts.pancakeOrg;
          if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
          return null;
        });
        pancakeProvider.isConfigured.mockReturnValue(true);
        prisma.automation.findMany.mockResolvedValue([dueAutomation]);
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
        );
        provider.sendMessage.mockResolvedValue({ wamid: 'w-meta' });
        pancakeProvider.sendTemplate.mockResolvedValue({
          providerMessageId: 'pancake-1',
          providerConversationId: null,
        });
        await service.executeDueAutomations();
      };

      it('org sandbox + Pancake configurado: SIMULA, no llama a Pancake', async () => {
        await runWith({ sandbox: ['org-1'], pancakeOrg: 'org-1' });

        expect(pancakeProvider.sendTemplate).not.toHaveBeenCalled();
        expect(provider.sendMessage).not.toHaveBeenCalled();
      });

      it('org sandbox sin Pancake: tampoco llama a Meta', async () => {
        await runWith({ sandbox: ['org-1'], pancakeOrg: null });

        expect(provider.sendMessage).not.toHaveBeenCalled();
      });

      it('org NO sandbox + Pancake: envía por Pancake de verdad', async () => {
        await runWith({ sandbox: null, pancakeOrg: 'org-1' });

        expect(pancakeProvider.sendTemplate).toHaveBeenCalledTimes(1);
        expect(provider.sendMessage).not.toHaveBeenCalled();
      });

      it('org NO sandbox + sin Pancake: envía por Meta', async () => {
        await runWith({ sandbox: null, pancakeOrg: null });

        expect(provider.sendMessage).toHaveBeenCalledTimes(1);
      });
    });

    // T-D5.3: la zona de la organización debe llegar hasta el renderizado de
    // la plantilla, y la resolución debe ser única por organización en el tick.
    describe('zona horaria de la organización (T-D5.3)', () => {
      function arrangeSend() {
        prisma.automation.findMany.mockResolvedValue([dueAutomation]);
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
        );
        provider.sendMessage.mockResolvedValue({
          providerMessageId: 'wamid-1',
          providerConversationId: '573000000000',
          status: 'SENT',
        });
        prisma.message.update.mockResolvedValue({});
      }

      it('resuelve la zona una sola vez por organización en el tick', async () => {
        // Tres automatizaciones de la misma organización: una sola consulta.
        const other = { ...dueAutomation, id: 'a-2', uuid: 'au-2' };
        const third = { ...dueAutomation, id: 'a-3', uuid: 'au-3' };
        prisma.automation.findMany.mockResolvedValue([
          dueAutomation,
          other,
          third,
        ]);
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
        );
        provider.sendMessage.mockResolvedValue({
          providerMessageId: 'wamid-1',
          providerConversationId: '573000000000',
          status: 'SENT',
        });
        prisma.message.update.mockResolvedValue({});

        await service.executeDueAutomations();

        expect(configuraciones.timeZoneOrganizacion).toHaveBeenCalledTimes(1);
        expect(configuraciones.timeZoneOrganizacion).toHaveBeenCalledWith(
          'org-1',
        );
      });

      it('propaga la zona de la organización al renderizar la plantilla', async () => {
        // La plantilla del snapshot incluye {purchaseDate}: el snapshot gana
        // sobre la heurística de campaña (buildAutomaticContent).
        const withTemplate = {
          ...dueAutomation,
          messageTemplate: 'Compra: {purchaseDate}',
        };
        prisma.automation.findMany.mockResolvedValue([withTemplate]);
        let createdContent: string | undefined;
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = txMock();
            tx.message.create.mockImplementation(
              (args: { data: { content: string } }) => {
                createdContent = args.data.content;
                return Promise.resolve({ id: 'm-1', uuid: 'mu-1' });
              },
            );
            return fn(tx);
          },
        );
        provider.sendMessage.mockResolvedValue({
          providerMessageId: 'wamid-1',
          providerConversationId: '573000000000',
          status: 'SENT',
        });
        prisma.message.update.mockResolvedValue({});

        // La compra está a 3 días de `now`; con TZ Asia/Tokyo el día civil
        // puede avanzar respecto a Bogotá en un instante cercano a medianoche.
        configuraciones.timeZoneOrganizacion.mockResolvedValue('Asia/Tokyo');

        await service.executeDueAutomations();

        expect(configuraciones.timeZoneOrganizacion).toHaveBeenCalledWith(
          'org-1',
        );
        expect(createdContent).toBeDefined();
        expect(createdContent).toContain('Compra: ');
      });

      it('cae al fallback cuando la organización no tiene zona resoluble', async () => {
        arrangeSend();
        // `timeZoneOrganizacion` siempre devuelve un identificador; el
        // modelo de no-resoluble se representa con el valor por defecto.
        configuraciones.timeZoneOrganizacion.mockResolvedValue(
          'America/Bogota',
        );

        await service.executeDueAutomations();

        expect(eligibility.evaluate).toHaveBeenCalledWith(
          expect.objectContaining({ timeZone: 'America/Bogota' }),
        );
      });
    });

    // TASK 1: el mensaje automático persiste el customerId de la compra para
    // que G3 (eligibility.checkAutomaticFrequency) pueda encontrarlo.
    it('persists customerId on automatic messages so G3 can find them', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      let txMessageCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock();
          txMessageCreate = tx.message.create;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      expect(txMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            automationId: 'a-1',
            customerId: 'cu-1',
            type: 'AUTOMATIC',
          }) as object,
        }),
      );
    });

    it('uses the per-stage campaign template for +3d/+6m/+12m (AU-005)', async () => {
      const withCampaign = (days: number) => ({
        ...dueAutomation,
        scheduledDate: new Date(
          dueAutomation.purchase.purchaseDate.getTime() + days * 86_400_000,
        ),
        campaign: {
          template: 'base {customerName}',
          templateD3: 'd3 {customerName}',
          templateD180: 'd180 {customerName}',
          templateD365: 'd365 {customerName}',
        },
      });
      const cases = [
        { days: 3, expected: 'd3 Juan Perez' },
        { days: 180, expected: 'd180 Juan Perez' },
        { days: 365, expected: 'd365 Juan Perez' },
      ];
      for (const entry of cases) {
        const due = withCampaign(entry.days);
        prisma.automation.findMany.mockResolvedValue([due]);
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = txMock();
            return fn(tx);
          },
        );
        provider.sendMessage.mockResolvedValue({
          providerMessageId: 'wamid-1',
          providerConversationId: '573000000000',
          status: 'SENT',
        });
        prisma.message.update.mockResolvedValue({});

        await service.executeDueAutomations();

        expect(provider.sendMessage).toHaveBeenCalledWith(
          '573000000000',
          expect.stringContaining(entry.expected),
          'org-1',
        );
      }
    });

    it('falls back to the campaign base template when the stage template is missing', async () => {
      const due = {
        ...dueAutomation,
        scheduledDate: new Date(now),
        campaign: { template: 'base {customerName}' },
      };
      prisma.automation.findMany.mockResolvedValue([due]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock();
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      expect(provider.sendMessage).toHaveBeenCalledWith(
        '573000000000',
        expect.stringContaining('base Juan Perez'),
        'org-1',
      );
    });

    it('uses the sequence snapshot (messageTemplate) over the campaign stage heuristics', async () => {
      const due = {
        ...dueAutomation,
        scheduledDate: new Date(now),
        messageTemplate: 'Hola {customerName}, tu {productName} vence pronto.',
        campaign: {
          template: 'base {customerName}',
          templateD3: 'd3 {customerName}',
          templateD180: 'd180 {customerName}',
          templateD365: 'd365 {customerName}',
        },
      };
      prisma.automation.findMany.mockResolvedValue([due]);
      let txMessageCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock();
          txMessageCreate = tx.message.create;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      // Snapshot wins: neither the D3 heuristic nor the base template applies.
      expect(provider.sendMessage).toHaveBeenCalledWith(
        '573000000000',
        'Hola Juan Perez, tu Lavadora vence pronto.',
        'org-1',
      );
      expect(txMessageCreate).toHaveBeenCalledWith(
        expectData({
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'QUEUED',
          automationId: 'a-1',
        }),
      );
    });

    it('falls back to legacy heuristics when the snapshot is empty or missing', async () => {
      const cases = [undefined, null, ''];
      for (const messageTemplate of cases) {
        provider.sendMessage.mockClear();
        const due = {
          ...dueAutomation,
          scheduledDate: new Date(now),
          messageTemplate,
          campaign: {
            template: 'base {customerName}',
            templateD3: null,
            templateD180: null,
            templateD365: null,
          },
        };
        prisma.automation.findMany.mockResolvedValue([due]);
        prisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = txMock();
            return fn(tx);
          },
        );
        provider.sendMessage.mockResolvedValue({
          providerMessageId: 'wamid-1',
          providerConversationId: '573000000000',
          status: 'SENT',
        });
        prisma.message.update.mockResolvedValue({});

        await service.executeDueAutomations();

        expect(provider.sendMessage).toHaveBeenCalledWith(
          '573000000000',
          expect.stringContaining('base Juan Perez'),
          'org-1',
        );
      }
    });

    it('executes a due automation, creates an OUTBOUND AUTOMATIC message and marks it SENT', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      let txMessageCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock();
          txMessageCreate = tx.message.create;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      expect(provider.sendMessage).toHaveBeenCalledWith(
        '573000000000',
        expect.stringContaining('Juan Perez'),
        'org-1',
      );
      expect(txMessageCreate).toHaveBeenCalledWith(
        expectData({
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'QUEUED',
          automationId: 'a-1',
        }),
      );
      const events = emittedNames();
      expect(events).toContain('MessageQueued');
      expect(events).toContain('MessageSent');
      expect(events).toContain('AutomationExecuted');
    });

    it('transitions SCHEDULED → EXECUTING and only EXECUTED after the send (P1)', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      let txAutomationUpdate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock();
          txAutomationUpdate = tx.automation.updateMany;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      // Guarded acquisition: SCHEDULED/ERROR → EXECUTING (in the transaction).
      expect(txAutomationUpdate).toHaveBeenCalledWith({
        where: { id: 'a-1', status: { in: ['SCHEDULED', 'ERROR'] } },
        data: expect.objectContaining({ status: 'EXECUTING' }) as object,
      });
      // EXECUTED is applied only after the provider confirms the send.
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({
          status: 'EXECUTED',
          executedDate: expect.any(Date) as Date,
        }) as object,
      });
    });

    it('moves a failed automation to ERROR (retryable) and increments retryCount', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      provider.sendMessage.mockRejectedValue(new Error('provider down'));
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.executeDueAutomations();

      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({
          status: 'ERROR',
          retryCount: { increment: 1 },
        }) as object,
      });
      const events = emittedNames();
      expect(events).toContain('AutomationFailed');
      expect(events).not.toContain('AutomationExecuted');
    });

    it('marks a Pancake ambiguous/non-retryable failure as terminal (no auto-retry, H5)', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'pancake.organizationId') return 'org-1';
        return null;
      });
      pancakeProvider.isConfigured.mockReturnValue(true);
      const timeout = new PancakeTimeoutError('timeout');
      timeout.retryable = false;
      pancakeProvider.sendTemplate.mockRejectedValue(timeout);
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.executeDueAutomations();

      // Terminal: ERROR with retryCount exhausted so the scheduler never re-picks.
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({
          status: 'ERROR',
          retryCount: 3,
        }) as object,
      });
      expect(pancakeProvider.sendTemplate).toHaveBeenCalledWith(
        '573000000000',
        {
          customer_name: 'Juan Perez',
          product_name: 'Lavadora',
          organization_name: 'Org Uno',
        },
        'org-1',
      );
      expect(pancakeProvider.sendMessage).not.toHaveBeenCalled();
    });

    it('keeps a Pancake retryable failure (429/5xx) on the retryable ERROR path', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'pancake.organizationId') return 'org-1';
        return null;
      });
      pancakeProvider.isConfigured.mockReturnValue(true);
      const rate = new PancakeRateLimitError('rate');
      rate.retryable = true;
      pancakeProvider.sendTemplate.mockRejectedValue(rate);
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.executeDueAutomations();

      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({
          status: 'ERROR',
          retryCount: { increment: 1 },
        }) as object,
      });
    });

    it('records a Pancake rejection as provider_error and logs the real reason', async () => {
      // Regression: Pancake failures used to be labelled internal_error and
      // the provider reason was dropped, so a blocked send could not be
      // diagnosed from the CRM logs.
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'pancake.organizationId') return 'org-1';
        return null;
      });
      pancakeProvider.isConfigured.mockReturnValue(true);
      const rejection = new PancakeApiError(
        'Pancake API returned success=false: insufficient balance (error_code=131042)',
      );
      rejection.retryable = false;
      pancakeProvider.sendTemplate.mockRejectedValue(rejection);
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      try {
        await service.executeDueAutomations();

        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'automation.failed',
            metadata: expect.objectContaining({
              reason: 'provider_error',
            }) as object,
          }),
        );
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('automatic send failed automation='),
          expect.stringContaining('insufficient balance'),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('sends automation messages through the approved template with named params', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'pancake.organizationId') return 'org-1';
        return null;
      });
      pancakeProvider.isConfigured.mockReturnValue(true);
      pancakeProvider.sendTemplate.mockResolvedValue({
        providerMessageId: 'pc-1',
        providerConversationId: 'waba_x_573000000000',
        status: 'SENT',
      });
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.executeDueAutomations();

      expect(pancakeProvider.sendTemplate).toHaveBeenCalledTimes(1);
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({ status: 'EXECUTED' }) as object,
      });
    });

    it('simulates the send for sandbox organizations and marks it as simulated (demo D1)', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.sandboxOrganizations') {
          return ['org-1'];
        }
        if (key === 'whatsapp.defaultOrganizationId') {
          return 'org-1';
        }
        return null;
      });
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.executeDueAutomations();

      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SENT',
            providerMessageId: expect.stringContaining('sim-') as string,
          }) as object,
        }),
      );
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: expect.objectContaining({ status: 'EXECUTED' }) as object,
      });
      const sent = emittedNames();
      expect(sent).toContain('AutomationExecuted');
    });

    it('never creates a second message when the status guard fails (AU-011)', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      let txMessageCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = txMock({ updateManyCount: 0 });
          txMessageCreate = tx.message.create;
          return fn(tx);
        },
      );

      await service.executeDueAutomations();

      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(txMessageCreate).not.toHaveBeenCalled();
    });

    it('skips automations whose customer is not ACTIVE (AU-005)', async () => {
      prisma.automation.findMany.mockResolvedValue([
        {
          ...dueAutomation,
          purchase: {
            ...dueAutomation.purchase,
            customer: {
              ...dueAutomation.purchase.customer,
              status: 'INACTIVE',
            },
          },
        },
      ]);

      await service.executeDueAutomations();

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(provider.sendMessage).not.toHaveBeenCalled();
    });

    it('marks the message FAILED and emits AutomationFailed when the customer has no phone', async () => {
      prisma.automation.findMany.mockResolvedValue([
        {
          ...dueAutomation,
          purchase: {
            ...dueAutomation.purchase,
            customer: { ...dueAutomation.purchase.customer, phone: null },
          },
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      expect(prisma.message.update).toHaveBeenCalledWith(
        expectData({ status: 'FAILED' }),
      );
      const events = emittedNames();
      expect(events).toContain('MessageFailed');
      expect(events).toContain('AutomationFailed');
    });

    it('marks the message FAILED when the provider send errors', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
      );
      provider.sendMessage.mockRejectedValue(new ProviderSendError());
      prisma.message.update.mockResolvedValue({});

      await service.executeDueAutomations();

      expect(prisma.message.update).toHaveBeenCalledWith(
        expectData({ status: 'FAILED' }),
      );
      const events = emittedNames();
      expect(events).toContain('MessageFailed');
      expect(events).toContain('AutomationFailed');
    });

    it('emits AutomationFailed and audits when the transaction itself fails (NR-011)', async () => {
      prisma.automation.findMany.mockResolvedValue([dueAutomation]);
      prisma.$transaction.mockRejectedValue(new Error('db unavailable'));

      await service.executeDueAutomations();

      expect(prisma.message.update).not.toHaveBeenCalled();
      const events = emittedNames();
      expect(events).toContain('AutomationFailed');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'automation.failed' }),
      );
    });
  });

  describe('expireStuckExecuting (F7)', () => {
    it('returns orphaned EXECUTING automations to ERROR/retry, never EXECUTED', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'whatsapp.executingTimeoutMs' ? 1000 : null,
      );
      prisma.automation.findMany.mockResolvedValue([
        {
          id: 'a-1',
          uuid: 'au-1',
          organizationId: 'org-1',
          purchaseId: 'pu-1',
        },
      ]);
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      await service.expireStuckExecuting();

      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'a-1', status: 'EXECUTING' },
        data: {
          status: 'ERROR',
          retryCount: { increment: 1 },
          updatedBy: null,
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'AutomationFailed',
        expect.objectContaining({
          payload: expect.objectContaining({
            reason: 'executing_timeout',
          }) as object,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'automation.failed' }),
      );
    });

    it('skips the sweep when the timeout is disabled (0)', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'whatsapp.executingTimeoutMs' ? 0 : null,
      );

      await service.expireStuckExecuting();

      expect(prisma.automation.findMany).not.toHaveBeenCalled();
      expect(prisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it('ignores automations that already left EXECUTING (guarded update)', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'whatsapp.executingTimeoutMs' ? 1000 : null,
      );
      prisma.automation.findMany.mockResolvedValue([
        {
          id: 'a-1',
          uuid: 'au-1',
          organizationId: 'org-1',
          purchaseId: 'pu-1',
        },
      ]);
      prisma.automation.updateMany.mockResolvedValue({ count: 0 });

      await service.expireStuckExecuting();

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'AutomationFailed',
        expect.objectContaining({
          payload: expect.objectContaining({ automationId: 'au-1' }) as object,
        }),
      );
    });
  });

  describe('sendManualMessage (US2, HG-11)', () => {
    it('creates an OUTBOUND MANUAL message and calls the provider', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'msg-uuid-1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'Hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      const result = await service.sendManualMessage(
        orgUser,
        { customerId: 'cuu-1', content: 'Hola' },
        'key-1',
      );

      expect(provider.sendMessage).toHaveBeenCalledWith(
        '573000000000',
        'Hola',
        'org-1',
      );
      expect(result).toEqual(
        expect.objectContaining({ uuid: 'msg-uuid-1', status: 'SENT' }),
      );
    });

    // TASK 1: el mensaje manual persiste el customerId del cliente para
    // que G4 (eligibility.checkManualSilence) pueda encontrarlo.
    it('persists customerId on manual messages so G4 can find them', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      let txMessageCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          };
          txMessageCreate = tx.message.create;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'msg-uuid-1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'Hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      await service.sendManualMessage(
        orgUser,
        { customerId: 'cuu-1', content: 'Hola' },
        'key-1',
      );

      expect(txMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cu-1',
            type: 'MANUAL',
          }) as object,
        }),
      );
    });

    it('throws CUSTOMER_NOT_FOUND for an unknown or cross-tenant customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.sendManualMessage(orgUser, {
          customerId: 'missing',
          content: 'Hola',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws CUSTOMER_NO_PHONE when the customer has no phone', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: null,
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      prisma.message.update.mockResolvedValue({});

      await expect(
        service.sendManualMessage(orgUser, {
          customerId: 'cuu-1',
          content: 'Hola',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws PROVIDER_ERROR and records the message FAILED on provider failure', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      provider.sendMessage.mockRejectedValue(new ProviderSendError());
      prisma.message.update.mockResolvedValue({});

      await expect(
        service.sendManualMessage(orgUser, {
          customerId: 'cuu-1',
          content: 'Hola',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.message.update).toHaveBeenCalledWith(
        expectData({ status: 'FAILED' }),
      );
    });

    it('returns the existing message when the Idempotency-Key repeats', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst
        .mockResolvedValueOnce({
          uuid: 'msg-uuid-1',
          conversationId: 'conv-uuid-1',
          automationId: null,
          type: 'MANUAL',
          content: 'Hola',
          direction: 'OUTBOUND',
          status: 'SENT',
          sentAt: new Date(now),
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(now),
          conversation: { customer: null },
        })
        .mockResolvedValueOnce({
          uuid: 'msg-uuid-1',
          conversationId: 'conv-uuid-1',
          automationId: null,
          type: 'MANUAL',
          content: 'Hola',
          direction: 'OUTBOUND',
          status: 'SENT',
          sentAt: new Date(now),
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(now),
          conversation: { customer: null },
        });

      const first = await service.sendManualMessage(
        orgUser,
        { customerId: 'cuu-1', content: 'Hola' },
        'dup-key',
      );
      const second = await service.sendManualMessage(
        orgUser,
        { customerId: 'cuu-1', content: 'Hola' },
        'dup-key',
      );

      expect(first.uuid).toBe('msg-uuid-1');
      expect(second.uuid).toBe('msg-uuid-1');
      expect(provider.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('reuses the customer OPEN conversation instead of creating a new one (R-010)', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      let txConversationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            conversation: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 'conv-1', uuid: 'conv-uuid-1' }),
              create: jest.fn(),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          };
          txConversationCreate = tx.conversation.create;
          return fn(tx);
        },
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'msg-uuid-1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'Hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      const result = await service.sendManualMessage(orgUser, {
        customerId: 'cuu-1',
        content: 'Hola',
      });

      expect(txConversationCreate).not.toHaveBeenCalled();
      expect(result.uuid).toBe('msg-uuid-1');
    });

    it('lets a PLATFORM_OWNER send to any organization customer (unscoped lookup)', async () => {
      const platformUser: AuthUser = {
        id: 'u-p',
        uuid: 'uu-p',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      };
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'msg-uuid-1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'Hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      const result = await service.sendManualMessage(platformUser, {
        customerId: 'cuu-1',
        content: 'Hola',
      });

      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            organizationId: expect.any(String) as unknown,
          }) as unknown,
        }),
      );
      expect(result.uuid).toBe('msg-uuid-1');
    });

    it('ignores an expired Idempotency-Key and sends the message again', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
            message: {
              create: jest.fn().mockResolvedValue({
                id: 'msg-1',
                uuid: 'msg-uuid-1',
              }),
            },
          }),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'msg-uuid-1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'Hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });
      const store = (
        service as unknown as {
          idempotencyStore: Map<
            string,
            { messageId: string; expiresAt: number }
          >;
        }
      ).idempotencyStore;
      store.set('org-1:expired-key', {
        messageId: 'stale-msg',
        expiresAt: Date.now() - 1000,
      });

      const result = await service.sendManualMessage(
        orgUser,
        { customerId: 'cuu-1', content: 'Hola' },
        'expired-key',
      );

      expect(provider.sendMessage).toHaveBeenCalledTimes(1);
      expect(result.uuid).toBe('msg-uuid-1');
    });
  });

  describe('sendReply (kit 018, HG-5/HG-6)', () => {
    const replyConversation = {
      id: 'co-1',
      uuid: 'cou-1',
      organizationId: 'org-1',
      status: 'OPEN',
      customer: { phone: '573000000000' },
    };

    const replyTx = () => ({
      message: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'msg-1', uuid: 'msg-uuid-1' }),
      },
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    const replyMessageDetail = {
      uuid: 'msg-uuid-1',
      conversationId: 'cou-1',
      automationId: null,
      type: 'OUTGOING',
      content: 'Hola',
      direction: 'OUTBOUND',
      status: 'SENT',
      sentAt: new Date(now),
      deliveredAt: null,
      readAt: null,
      createdAt: new Date(now),
      conversation: { customer: null },
    };

    it('creates an OUTGOING OUTBOUND reply and calls the provider', async () => {
      prisma.conversation.findFirst.mockResolvedValue(replyConversation);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(replyTx()),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(replyMessageDetail);

      const result = await service.sendReply(orgUser, 'cou-1', 'Hola', 'key-1');

      expect(provider.sendMessage).toHaveBeenCalledWith(
        '573000000000',
        'Hola',
        'org-1',
      );
      expect(emittedNames()).toContain('MessageQueued');
      expect(result).toEqual(expect.objectContaining({ status: 'SENT' }));
    });

    // TASK 1: la respuesta del asesor propaga el customerId de la
    // conversación para que G3/G4 vean también este OUTBOUND.
    it('propagates customerId from the conversation on advisor replies', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...replyConversation,
        customerId: 'cu-1',
      });
      const tx = replyTx();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(replyMessageDetail);

      await service.sendReply(orgUser, 'cou-1', 'Hola');

      expect(tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cu-1',
            type: 'OUTGOING',
          }) as object,
        }),
      );
    });

    it('reopens a CLOSED conversation to OPEN atomically with the reply (HG-5)', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...replyConversation,
        status: 'CLOSED',
      });
      const tx = replyTx();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(replyMessageDetail);

      await service.sendReply(orgUser, 'cou-1', 'Hola');

      expect(tx.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'co-1', status: 'CLOSED' },
        data: { status: 'OPEN' },
      });
    });

    it('does not reopen an OPEN conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(replyConversation);
      const tx = replyTx();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(replyMessageDetail);

      await service.sendReply(orgUser, 'cou-1', 'Hola');

      expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a reply to an ARCHIVED conversation (400 VALIDATION_ERROR)', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...replyConversation,
        status: 'ARCHIVED',
      });

      await expect(
        service.sendReply(orgUser, 'cou-1', 'Hola'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns null for a cross-tenant conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      const result = await service.sendReply(orgUser, 'cou-1', 'Hola');

      expect(result).toBeNull();
    });

    it('throws VALIDATION_ERROR and fails the message when the customer has no phone (018 contract)', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...replyConversation,
        customer: { phone: null },
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(replyTx()),
      );
      prisma.message.update.mockResolvedValue({});

      await expect(
        service.sendReply(orgUser, 'cou-1', 'Hola'),
      ).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
      expect(emittedNames()).toContain('MessageFailed');
    });

    it('throws PROVIDER_ERROR and fails the message on provider failure', async () => {
      prisma.conversation.findFirst.mockResolvedValue(replyConversation);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(replyTx()),
      );
      provider.sendMessage.mockRejectedValue(new Error('provider down'));
      prisma.message.update.mockResolvedValue({});

      await expect(
        service.sendReply(orgUser, 'cou-1', 'Hola'),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(emittedNames()).toContain('MessageFailed');
    });

    it('returns the existing message when the Idempotency-Key repeats', async () => {
      prisma.conversation.findFirst.mockResolvedValue(replyConversation);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(replyTx()),
      );
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(replyMessageDetail);

      const first = await service.sendReply(
        orgUser,
        'cou-1',
        'Hola',
        'dup-key',
      );
      const second = await service.sendReply(
        orgUser,
        'cou-1',
        'Hola',
        'dup-key',
      );

      expect(first?.uuid).toBe('msg-uuid-1');
      expect(second?.uuid).toBe('msg-uuid-1');
      expect(provider.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleInboundMessage (US3, HG-8)', () => {
    it('identifies the customer by phone and opens a conversation on first message', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          uuid: 'cuu-1',
          organizationId: 'org-1',
          phone: '573000000000',
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '573000000000',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: 'conv-p-1',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expectData({
          type: 'INCOMING',
          direction: 'INBOUND',
          providerMessageId: 'wamid.in.1',
        }),
      );
      const events = emittedNames();
      expect(events).toContain('ConversationOpened');
      expect(events).toContain('MessageReceived');
    });

    it('attributes an inbound reply to the last recent automation of the conversation (Fase 2, P0-4)', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null) // idempotency
        .mockResolvedValueOnce({ automationId: 'auto-int-1' }); // reply origin
      prisma.automation.findUnique.mockResolvedValue({
        uuid: 'auto-1',
        campaignId: 'camp-1',
      });
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          uuid: 'cuu-1',
          organizationId: 'org-1',
          phone: '573000000000',
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
              create: jest.fn(),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.2',
        from: '573000000000',
        text: 'Sí, quiero revisar la batería',
        timestamp: '1755000000',
        providerConversationId: 'conv-p-1',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inReplyToAutomationId: 'auto-1',
            inReplyToCampaignId: 'camp-1',
          }) as object,
        }),
      );
    });

    it('auto-creates a PENDING customer and links the conversation for an unknown number (Decisión 4)', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.create.mockResolvedValue({
        id: 'cu-auto',
        uuid: 'cuu-auto',
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.2',
        from: '579999999999',
        text: 'Quien es',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codcli: 'W579999999999',
            name: 'Contacto WhatsApp +579999999999',
            phone: '579999999999',
            status: 'PENDING',
          }) as object,
        }),
      );
      const txCalls = prisma.$transaction.mock.calls as unknown[][];
      const createCall = txCalls[0][0] as (tx: unknown) => Promise<unknown>;
      const conversationCreate = jest.fn().mockResolvedValue({
        id: 'conv-1',
        uuid: 'conv-uuid-1',
      });
      await createCall({
        conversation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: conversationCreate,
        },
      });
      expect(conversationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: 'cu-auto' }) as object,
        }),
      );
      // Decisión 4: inbound never creates a purchase nor triggers AU-001.
      expect(emittedNames()).not.toContain('PurchaseImported');
    });

    it('persists button fields from a button_reply without inferring meaning', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          uuid: 'cuu-1',
          organizationId: 'org-1',
          phone: '573000000000',
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
              create: jest.fn(),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.btn.1',
        from: '573000000000',
        text: '',
        timestamp: '1755000000',
        providerConversationId: null,
        buttonId: 'review-consent-yes',
        buttonTitle: 'Sí, activar',
        inReplyToProviderId: 'wamid.out.review.1',
      });

      // Transporte únicamente: se persiste tal cual. El título NO sustituye
      // `content` y no se registra ningún consentimiento aquí.
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: '',
            buttonId: 'review-consent-yes',
            buttonTitle: 'Sí, activar',
            inReplyToProviderId: 'wamid.out.review.1',
          }) as object,
        }),
      );
    });

    it('persists null button fields for plain text (unchanged behavior)', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          uuid: 'cuu-1',
          organizationId: 'org-1',
          phone: '573000000000',
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
              create: jest.fn(),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.3',
        from: '573000000000',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Hola',
            buttonId: null,
            buttonTitle: null,
            inReplyToProviderId: null,
          }) as object,
        }),
      );
    });

    it('is a no-op for a replayed providerMessageId (idempotency, HG-13)', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-1' });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '573000000000',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('is a no-op when no default organization is configured', async () => {
      configService.get.mockImplementation(() => null);

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '573000000000',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('reuses the OPEN conversation and does not emit ConversationOpened again', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        {
          id: 'cu-1',
          uuid: 'cuu-1',
          organizationId: 'org-1',
          phone: '573000000000',
        },
      ]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 'conv-1', uuid: 'conv-uuid-1' }),
              create: jest.fn(),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '573000000000',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      const events = emittedNames();
      expect(events).toContain('MessageReceived');
      expect(events).not.toContain('ConversationOpened');
    });

    it('is a no-op when the conversation create races with another worker (P2002)', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '579999999999',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('propagates a non-P2002 conversation transaction error', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockRejectedValue(new Error('db boom'));

      await expect(
        service.handleInboundMessage({
          providerMessageId: 'wamid.in.1',
          from: '579999999999',
          text: 'Hola',
          timestamp: '1755000000',
          providerConversationId: null,
        }),
      ).rejects.toThrow('db boom');
    });

    it('is a no-op when the message create races with another worker (P2002)', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '579999999999',
        text: 'Hola',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('propagates a non-P2002 message create error', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockRejectedValue(new Error('db boom'));

      await expect(
        service.handleInboundMessage({
          providerMessageId: 'wamid.in.1',
          from: '579999999999',
          text: 'Hola',
          timestamp: '1755000000',
          providerConversationId: null,
        }),
      ).rejects.toThrow('db boom');
    });

    it('persists the inbound message with sentAt null for an empty timestamp', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '579999999999',
        text: 'Hola',
        timestamp: '',
        providerConversationId: null,
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sentAt: null }) as unknown,
        }),
      );
    });

    it('returns a non-numeric ISO date for provider date timestamps', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '579999999999',
        text: 'Hola',
        timestamp: '2026-08-17T12:00:00Z',
        providerConversationId: null,
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sentAt: expect.any(Date) as unknown,
          }) as unknown,
        }),
      );
    });

    it('drops the timestamp when it is not parseable', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });

      await service.handleInboundMessage({
        providerMessageId: 'wamid.in.1',
        from: '579999999999',
        text: 'Hola',
        timestamp: 'not-a-date',
        providerConversationId: null,
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sentAt: null }) as unknown,
        }),
      );
    });
  });

  describe('handleInboundPayload (webhook dispatch)', () => {
    it('processes inbound messages and status callbacks from a payload', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ uuid: 'msg-uuid-1', conversationId: 'c-1' });
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                id: 'conv-1',
                uuid: 'conv-uuid-1',
              }),
            },
          }),
      );
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        uuid: 'msg-uuid-1',
      });
      prisma.message.updateMany.mockResolvedValue({ count: 1 });

      await service.handleInboundPayload({
        messages: [
          {
            providerMessageId: 'wamid.in.1',
            from: '579999999999',
            text: 'Hola',
            timestamp: '1755000000',
            providerConversationId: null,
          },
        ],
        statuses: [
          {
            providerMessageId: 'wamid-1',
            status: 'SENT',
            timestamp: '1755000000',
            providerConversationId: null,
          },
        ],
      });

      expect(prisma.message.create).toHaveBeenCalled();
      expect(prisma.message.updateMany).toHaveBeenCalled();
      const events = emittedNames();
      expect(events).toContain('MessageReceived');
      expect(events).toContain('MessageSent');
    });
  });

  describe('handleStatusUpdate (FR-006)', () => {
    it('transitions QUEUED → SENT and emits MessageSent', async () => {
      prisma.message.updateMany.mockResolvedValue({ count: 1 });
      prisma.message.findFirst.mockResolvedValue({ uuid: 'msg-uuid-1' });

      await service.handleStatusUpdate({
        providerMessageId: 'wamid-1',
        status: 'SENT',
        timestamp: '1755000000',
        providerConversationId: 'conv-p-1',
      });

      expect(prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'QUEUED' }) as unknown,
        }),
      );
      const events = emittedNames();
      expect(events).toContain('MessageSent');
    });

    it('is a no-op for stale callbacks that match no message', async () => {
      prisma.message.updateMany.mockResolvedValue({ count: 0 });

      await service.handleStatusUpdate({
        providerMessageId: 'wamid-stale',
        status: 'READ',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('is a no-op when no default organization is configured', async () => {
      configService.get.mockImplementation(() => null);

      await service.handleStatusUpdate({
        providerMessageId: 'wamid-1',
        status: 'SENT',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op for an unknown status callback', async () => {
      await service.handleStatusUpdate({
        providerMessageId: 'wamid-1',
        status: 'UNKNOWN' as never,
        timestamp: '1755000000',
        providerConversationId: null,
      });

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it('accepts ISO date timestamps from provider callbacks', async () => {
      prisma.message.updateMany.mockResolvedValue({ count: 0 });

      await service.handleStatusUpdate({
        providerMessageId: 'wamid-1',
        status: 'SENT',
        timestamp: '2026-08-17T12:00:00Z',
        providerConversationId: null,
      });

      expect(prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sentAt: expect.any(Date) as unknown,
          }) as unknown,
        }),
      );
    });
  });

  describe('reads (US4, US5)', () => {
    it('lists conversations with pagination meta for an org user', async () => {
      prisma.conversation.count.mockResolvedValue(1);
      prisma.conversation.findMany.mockResolvedValue([
        {
          uuid: 'conv-uuid-1',
          channel: 'WHATSAPP_CLIENTS',
          status: 'OPEN',
          customerId: 'cu-1',
          advisorId: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          messages: [],
        },
      ]);

      const result = await service.listConversations(orgUser, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }) as unknown,
        }),
      );
    });

    it('returns conversation detail with messages for a scoped uuid', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        uuid: 'conv-uuid-1',
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
        customerId: 'cu-1',
        advisorId: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        messages: [
          {
            uuid: 'msg-uuid-1',
            conversationId: 'conv-uuid-1',
            automationId: null,
            type: 'INCOMING',
            content: 'Hola',
            direction: 'INBOUND',
            status: 'SENT',
            sentAt: null,
            deliveredAt: null,
            readAt: null,
            createdAt: new Date(now),
          },
        ],
      });

      const result = await service.getConversation(orgUser, {
        uuid: 'conv-uuid-1',
      });

      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0].content).toBe('Hola');
    });

    it('returns null for a cross-tenant conversation (scoped query)', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      const result = await service.getConversation(orgUser, {
        uuid: 'other-org-conv',
      });

      expect(result).toBeNull();
    });

    it('lists messages for an org user', async () => {
      prisma.message.count.mockResolvedValue(2);
      prisma.message.findMany.mockResolvedValue([
        {
          uuid: 'm1',
          conversationId: 'conv-uuid-1',
          automationId: null,
          type: 'INCOMING',
          content: 'a',
          direction: 'INBOUND',
          status: 'SENT',
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(now),
        },
        {
          uuid: 'm2',
          conversationId: 'conv-uuid-1',
          automationId: null,
          type: 'OUTGOING',
          content: 'b',
          direction: 'OUTBOUND',
          status: 'QUEUED',
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(now),
        },
      ]);

      const result = await service.listMessages(orgUser, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('returns message detail for a scoped uuid', async () => {
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'm1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'MANUAL',
        content: 'hola',
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(now),
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      const result = await service.getMessage(orgUser, 'm1');

      expect(result?.status).toBe('SENT');
    });

    it('returns null for an unknown or cross-tenant message (scoped query)', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getMessage(orgUser, 'nope');

      expect(result).toBeNull();
    });

    it('applies conversation filters (status, channel, customer, advisor, dates)', async () => {
      prisma.conversation.count.mockResolvedValue(0);
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.listConversations(orgUser, {
        status: 'OPEN',
        channel: 'WHATSAPP_CLIENTS',
        customerId: 'cuu-1',
        advisorId: 'ad-1',
        createdFrom: '2026-08-01',
        createdTo: '2026-08-02',
      });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPEN',
            channel: 'WHATSAPP_CLIENTS',
            customer: { uuid: 'cuu-1' },
            advisor: { uuid: 'ad-1' },
            createdAt: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-02T23:59:59.999Z'),
            },
          }) as unknown,
        }),
      );
    });

    it('applies the inbox filters assigned and tagIds (kit 018)', async () => {
      prisma.conversation.count.mockResolvedValue(0);
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.listConversations(orgUser, {
        assigned: 'true',
        tagIds: 'tagu-1,tagu-2',
      });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            advisor: { isNot: null },
            tagAssignments: {
              some: {
                deletedAt: null,
                tag: { uuid: { in: ['tagu-1', 'tagu-2'] } },
              },
            },
          }) as unknown,
        }),
      );
    });

    it('filters unassigned conversations (assigned=false)', async () => {
      prisma.conversation.count.mockResolvedValue(0);
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.listConversations(orgUser, { assigned: 'false' });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ advisor: { is: null } }) as unknown,
        }),
      );
    });

    it('applies message filters (status, direction, conversation, automation, dates)', async () => {
      prisma.message.count.mockResolvedValue(0);
      prisma.message.findMany.mockResolvedValue([]);

      await service.listMessages(orgUser, {
        status: 'SENT',
        direction: 'OUTBOUND',
        conversationId: 'conv-uuid-1',
        automationId: 'au-1',
        createdFrom: '2026-08-01T00:00:00.000Z',
        createdTo: '2026-08-03T00:00:00.000Z',
      });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SENT',
            direction: 'OUTBOUND',
            conversation: { uuid: 'conv-uuid-1' },
            automation: { uuid: 'au-1' },
            createdAt: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-03T00:00:00.000Z'),
            },
          }) as unknown,
        }),
      );
    });

    it('rejects an invalid sort field defensively (BAD_REQUEST)', async () => {
      await expect(
        service.listConversations(orgUser, { sort: 'bogus' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a PLATFORM_OWNER read any conversation and message (unscoped)', async () => {
      const platformUser: AuthUser = {
        id: 'u-p',
        uuid: 'uu-p',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      };
      prisma.conversation.findFirst.mockResolvedValue({
        uuid: 'conv-uuid-1',
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
        customerId: 'cu-1',
        advisorId: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        messages: [],
      });
      prisma.message.findFirst.mockResolvedValue({
        uuid: 'm1',
        conversationId: 'conv-uuid-1',
        automationId: null,
        type: 'INCOMING',
        content: 'a',
        direction: 'INBOUND',
        status: 'SENT',
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: new Date(now),
        conversation: { customer: null },
      });

      const conv = await service.getConversation(platformUser, {
        uuid: 'conv-uuid-1',
      });
      const msg = await service.getMessage(platformUser, 'm1');

      expect(conv?.uuid).toBe('conv-uuid-1');
      expect(msg?.uuid).toBe('m1');
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            organizationId: expect.any(String) as unknown,
          }) as unknown,
        }),
      );
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            organizationId: expect.any(String) as unknown,
          }) as unknown,
        }),
      );
    });
  });

  describe('Pancake global template path (2026-09-10)', () => {
    const pancakeConfig = () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'pancake.organizationId') return 'org-1';
        return null;
      });
      pancakeProvider.isConfigured.mockReturnValue(true);
    };

    it('routes manual sends through the template resolving customer/organization names', async () => {
      pancakeConfig();
      pancakeProvider.sendTemplate.mockResolvedValue({
        providerMessageId: 'pc-1',
        providerConversationId: 'waba_x_573000000000',
        status: 'SENT',
      });
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        organizationId: 'org-1',
        phone: '573000000000',
        name: 'Juan Perez',
      });
      prisma.organization.findUnique.mockResolvedValue({ name: 'Org Uno' });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest
                .fn()
                .mockResolvedValue({ id: 'conv-1', uuid: 'conv-uuid-1' }),
            },
            message: {
              create: jest
                .fn()
                .mockResolvedValue({ id: 'msg-1', uuid: 'msg-uuid-1' }),
            },
          };
          return fn(tx);
        },
      );
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(null);

      await service.sendManualMessage(orgUser, {
        customerId: 'cuu-1',
        content: 'Hola',
      });

      expect(pancakeProvider.sendTemplate).toHaveBeenCalledWith(
        '573000000000',
        {
          customer_name: 'Juan Perez',
          product_name: '',
          organization_name: 'Org Uno',
        },
        'org-1',
      );
    });

    it('routes advisor replies through the template resolving names', async () => {
      pancakeConfig();
      pancakeProvider.sendTemplate.mockResolvedValue({
        providerMessageId: 'pc-1',
        providerConversationId: 'waba_x_573000000000',
        status: 'SENT',
      });
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'co-1',
        uuid: 'cou-1',
        organizationId: 'org-1',
        status: 'OPEN',
        customer: { phone: '573000000000' },
      });
      prisma.customer.findFirst.mockResolvedValue({ name: 'Juan Perez' });
      prisma.organization.findUnique.mockResolvedValue({ name: 'Org Uno' });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            message: {
              create: jest
                .fn()
                .mockResolvedValue({ id: 'msg-1', uuid: 'msg-uuid-1' }),
            },
            conversation: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          return fn(tx);
        },
      );
      prisma.message.update.mockResolvedValue({});
      prisma.message.findFirst.mockResolvedValue(null);

      await service.sendReply(orgUser, 'cou-1', 'Hola');

      expect(pancakeProvider.sendTemplate).toHaveBeenCalledWith(
        '573000000000',
        {
          customer_name: 'Juan Perez',
          product_name: '',
          organization_name: 'Org Uno',
        },
        'org-1',
      );
      expect(provider.sendMessage).not.toHaveBeenCalled();
    });
  });
  // AUTO-SAFETY-002 ---------------------------------------------------
  describe('contención de envíos por política', () => {
    const denied = { allowed: false, reason: 'SWITCH_DENIED' as const };

    beforeEach(() => {
      jest.clearAllMocks();
      sendPermit.evaluate.mockReturnValue({ allowed: true });
      prisma.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) =>
          fn({
            // G3-02: candado `SELECT ... FOR UPDATE` sobre la fila del cliente.
            $queryRaw: jest.fn().mockResolvedValue([]),
            automation: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest
                .fn()
                .mockResolvedValue({ id: 'conv-1', uuid: 'conv-uuid-1' }),
            },
            message: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest
                .fn()
                .mockResolvedValue({ id: 'msg-1', uuid: 'msg-uuid-1' }),
            },
          }),
      );
    });

    function denyPolicy() {
      sendPermit.evaluate.mockReturnValue(denied);
    }

    it('R1 · no llama al proveedor ni crea mensaje bajo política denegada', async () => {
      denyPolicy();
      prisma.automation.findMany.mockResolvedValue([
        {
          id: 'au-1',
          uuid: 'auu-1',
          organizationId: 'org-1',
          purchaseId: 'pu-1',
          scheduledDate: new Date(),
          messageTemplate: null,
          purchase: {
            purchaseDate: new Date(),
            warrantyExpiresAt: null,
            customer: {
              id: 'cu-1',
              uuid: 'cuu-1',
              phone: '573001234567',
              name: 'Ana',
              status: 'ACTIVE',
            },
            product: { name: 'Bateria', category: null },
          },
          organization: { name: 'Org' },
          campaign: null,
        },
      ] as never);

      await service.executeDueAutomations();

      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(pancakeProvider.sendTemplate).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'outbound.send',
          outcome: 'blocked',
        }),
      );
    });

    it('R2 · sendManualMessage se bloquea antes de crear el mensaje', async () => {
      denyPolicy();
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cu-1',
        uuid: 'cuu-1',
        phone: '573001234567',
        organizationId: 'org-1',
      });
      const orgUser = {
        id: 'u-1',
        organizationId: 'org-1',
        accountType: 'ORGANIZATION',
        roles: [],
      } as never;

      await expect(
        service.sendManualMessage(orgUser, {
          customerId: 'cu-1',
          content: 'Hola',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(pancakeProvider.sendTemplate).not.toHaveBeenCalled();
    });

    it('R3 · sendReply se bloquea antes de crear el mensaje ni reabrir', async () => {
      denyPolicy();
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'co-1',
        uuid: 'cou-1',
        organizationId: 'org-1',
        status: 'CLOSED',
        customerId: 'cu-1',
        customer: { phone: '573001234567' },
      });
      const orgUser = {
        id: 'u-1',
        organizationId: 'org-1',
        accountType: 'ORGANIZATION',
        roles: [],
      } as never;

      await expect(
        service.sendReply(orgUser, 'cou-1', 'Hola'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(provider.sendMessage).not.toHaveBeenCalled();
    });

    it('R1 · un bloqueo en el punto de salida no consume reintentos ni marca EXECUTED', async () => {
      const tx = {
        // G3-02: candado `SELECT ... FOR UPDATE` sobre la fila del cliente.
        $queryRaw: jest.fn().mockResolvedValue([]),
        automation: {
          updateMany: jest
            .fn()
            .mockResolvedValueOnce({ count: 1 }) // SCHEDULED -> EXECUTING
            .mockResolvedValueOnce({ count: 1 }), // EXECUTING -> SCHEDULED
        },
        conversation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockResolvedValue({ id: 'conv-1', uuid: 'conv-uuid-1' }),
        },
        message: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockResolvedValue({ id: 'msg-1', uuid: 'msg-uuid-1' }),
        },
      };
      const automationUpdateMany = tx.automation.updateMany;
      prisma.automation.updateMany = jest.fn();
      prisma.message.update = jest.fn().mockResolvedValue(undefined);

      prisma.automation.findMany.mockResolvedValue([
        {
          id: 'au-1',
          uuid: 'auu-1',
          organizationId: 'org-1',
          purchaseId: 'pu-1',
          scheduledDate: new Date(),
          messageTemplate: null,
          purchase: {
            purchaseDate: new Date(),
            warrantyExpiresAt: null,
            customer: {
              id: 'cu-1',
              uuid: 'cuu-1',
              phone: '573001234567',
              name: 'Ana',
              status: 'ACTIVE',
            },
            product: { name: 'Bateria', category: null },
          },
          organization: { name: 'Org' },
          campaign: null,
        },
      ] as never);
      prisma.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      );
      tx.automation.updateMany.mockClear();
      provider.sendMessage.mockRejectedValue(
        new SendBlockedError('SWITCH_DENIED', 'WHATSAPP'),
      );

      await service.executeDueAutomations();

      // La automatización vuelve a SCHEDULED y NO se toca retryCount ni
      // scheduledDate: solo la transición guardada EXECUTING -> SCHEDULED.
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: 'au-1', status: 'EXECUTING' },
        data: { status: 'SCHEDULED' },
      });
      // Ninguna de las dos transiciones toca retryCount ni scheduledDate.
      expect(JSON.stringify(automationUpdateMany.mock.calls)).not.toContain(
        'retryCount',
      );
      expect(
        JSON.stringify(prisma.automation.updateMany.mock.calls),
      ).not.toContain('retryCount');
      expect(JSON.stringify(automationUpdateMany.mock.calls)).not.toContain(
        'scheduledDate',
      );
      expect(
        JSON.stringify(prisma.automation.updateMany.mock.calls),
      ).not.toContain('scheduledDate');
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { status: 'FAILED', failureReason: 'send_blocked_by_policy' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'outbound.send',
          outcome: 'blocked',
        }),
      );
    });

    it('R1 · organización sandbox sigue simulando aunque la política deniegue', async () => {
      denyPolicy();
      configService.get.mockImplementation((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') return 'org-1';
        if (key === 'whatsapp.sandboxOrganizations') return ['org-1'];
        return null;
      });
      prisma.automation.findMany.mockResolvedValue([
        {
          id: 'au-1',
          uuid: 'auu-1',
          organizationId: 'org-1',
          purchaseId: 'pu-1',
          scheduledDate: new Date(),
          messageTemplate: null,
          purchase: {
            purchaseDate: new Date(),
            warrantyExpiresAt: null,
            customer: {
              id: 'cu-1',
              uuid: 'cuu-1',
              phone: '573001234567',
              name: 'Ana',
              status: 'ACTIVE',
            },
            product: { name: 'Bateria', category: null },
          },
          organization: { name: 'Org' },
          campaign: null,
        },
      ] as never);

      await service.executeDueAutomations();

      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(pancakeProvider.sendTemplate).not.toHaveBeenCalled();
      // La simulación es compatible con la política: se marca SENT con id sim-
      expect(JSON.stringify(prisma.message.update.mock.calls)).toContain(
        'sim-',
      );
    });
  });
});

// --- G3-01: reproducencia del envío duplicado en vuelo -----------------------
describe('G3-01 · una automatización en vuelo no permite un segundo envío', () => {
  /**
   * Reproduce la composición real scheduler → elegibilidad → creación de
   * mensaje con DOS automatizaciones del MISMO cliente evaluadas por DOS
   * workers concurrentes (dos ticks solapados o dos réplicas del API).
   *
   * Se usa el `EligibilityService` REAL, no el mock del arnés principal: el
   * defecto vive en la COMPOSICIÓN. G3 consulta `messages` y el bucle crea
   * filas; un mock de `evaluate` haría al test incapaz de fallar.
   *
   * Modelo: `store` representa `messages`. `message.create` añade la fila en
   * QUEUED con `sentAt: null` (el proveedor aún no ha confirmado) y
   * `message.findFirst` aplica el `where` real de G3
   * (customerId + type + direction + sentAt NOT NULL + deletedAt NULL).
   * `automation.updateMany` modela el guard AU-011: transición condicionada
   * por `status`, que es POR AUTOMATIZACIÓN y no por cliente.
   */
  type Stored = {
    id: string;
    customerId: string | null;
    type: string;
    direction: string;
    status: string;
    sentAt: Date | null;
    deletedAt: Date | null;
  };

  const buildWorld = () => {
    const store: Stored[] = [];
    const autoStatus = new Map<string, string>([
      ['a-1', 'SCHEDULED'],
      ['a-2', 'SCHEDULED'],
    ]);

    // Filtro modelado tal como lo emite el código real. Prisma OMITE del
    // `where` las claves con valor `undefined`, de modo que un filtro ausente
    // NO restringe: `customerId: undefined` casa con cualquier fila. Se modela
    // aquí para que "identidad ausente" no pueda convertirse por accidente en
    // autorización de envío.
    type WhereMensaje = {
      customerId?: string | null;
      type?: string;
      direction?: string;
      status?: string | { in: string[] };
      deletedAt?: Date | null;
      sentAt?: { not: null };
    };

    const coincide = (
      w: WhereMensaje,
      campo: keyof WhereMensaje,
      valor: unknown,
    ): boolean => w[campo] === undefined || w[campo] === valor;

    const message = {
      findFirst: jest.fn((args: { where: WhereMensaje }) => {
        const w = args.where ?? {};
        const hit = store
          .filter(
            (m) =>
              coincide(w, 'customerId', m.customerId) &&
              coincide(w, 'type', m.type) &&
              coincide(w, 'direction', m.direction) &&
              coincide(w, 'status', m.status) &&
              coincide(w, 'deletedAt', m.deletedAt) &&
              (!w.sentAt || !('not' in w.sentAt) || m.sentAt !== null),
          )
          .sort(
            (a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0),
          )[0];
        return hit ? { id: hit.id, sentAt: hit.sentAt } : null;
      }),
      create: jest.fn(
        (args: { data: Omit<Stored, 'id' | 'sentAt' | 'deletedAt'> }) => {
          const row: Stored = {
            id: `msg-${store.length + 1}`,
            customerId: args.data.customerId ?? null,
            type: args.data.type,
            direction: args.data.direction,
            status: args.data.status,
            sentAt: null,
            deletedAt: null,
          };
          store.push(row);
          return { id: row.id, uuid: `u-${row.id}` };
        },
      ),
      update: jest.fn(
        (args: { where: { id: string }; data: Partial<Stored> }) => {
          const row = store.find((m) => m.id === args.where.id);
          if (row) Object.assign(row, args.data);
          return row ?? {};
        },
      ),
    };

    // El `where` real del guard AU-011 usa `status: { in: [...] }`.
    type WhereAutomatizacion = {
      id: string;
      status?: string | { in: string[] };
    };

    const automation = {
      findMany: jest.fn(),
      updateMany: jest.fn(
        (args: { where: WhereAutomatizacion; data: { status: string } }) => {
          // Guard AU-011: transición condicionada POR AUTOMATIZACIÓN.
          const w = args.where;
          const prev = autoStatus.get(w.id);
          if (w.status !== undefined) {
            const permitido =
              typeof w.status === 'object' && Array.isArray(w.status.in)
                ? prev !== undefined && w.status.in.includes(prev)
                : prev === w.status;
            if (!permitido) return { count: 0 };
          }
          autoStatus.set(w.id, args.data.status);
          return { count: 1 };
        },
      ),
    };

    const conversation = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Record<string, unknown> }) => ({
        id: `cv-${store.length}`,
        uuid: `cvv-${store.length}`,
        ...args.data,
      })),
    };

    // Se declara antes que `prisma` para no referenciarlo en su propio
    // inicializador (TS7022). G3-02: `tx.$queryRaw` ejecuta el candado
    // `SELECT ... FOR UPDATE` de la fila del cliente (tagged template).
    const tx = {
      automation,
      message,
      conversation,
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const prisma = {
      message,
      // G2: opt-out. `noContactAt: null` => sin bloqueo.
      customer: {
        findUnique: jest.fn().mockResolvedValue({ noContactAt: null }),
      },
      // G8 (startDate) y G1 (lifecyclePausedAt) leen la misma fila.
      commercialCycle: {
        findUnique: jest.fn().mockResolvedValue({
          startDate: new Date('2026-01-15T12:00:00.000Z'),
          lifecyclePausedAt: null,
        }),
      },
      // G7 no aplica: la plantilla no es de mantenimiento.
      lifecycleConsent: { findFirst: jest.fn().mockResolvedValue(null) },
      automation,
      conversation,
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const eligibility = new EligibilityService(prisma as never);

    // Proveedor por defecto: los tests que necesitan un comportamiento
    // distinto por worker se lo pasan a `newService`.
    const provider = { sendMessage: jest.fn() };

    const newService = (
      envio: { sendMessage: jest.Mock } = provider,
    ): WhatsappService =>
      new WhatsappService(
        prisma as never,
        { record: jest.fn() } as never,
        { emit: jest.fn() } as never,
        envio,
        { sendMessage: jest.fn(), sendTemplate: jest.fn() } as never,
        { get: jest.fn(() => null) } as never,
        {
          dentroDeHorario: jest.fn().mockResolvedValue(true),
          timeZoneOrganizacion: jest.fn().mockResolvedValue('America/Bogota'),
        } as never,
        eligibility,
        {} as never,
        {
          evaluate: jest.fn(() => ({ allowed: true })),
          assert: jest.fn(),
        } as never,
      );

    return { store, autoStatus, tx, prisma, provider, newService };
  };

  /**
   * El bucle usa `new Date()` (no recibe `now`), así que G5 —ventana horaria—
   * evalúa el reloj del PROCESO. Se fija a un lunes 12:00 de Bogotá, dentro de
   * la ventana por defecto 08:00-19:30, para que G5 no sea lo que salte y el
   * test aísle exactamente el gate G3.
   */
  const FIXED_NOW = new Date('2026-10-05T17:00:00.000Z'); // lunes, 12:00 COT

  beforeEach(() => {
    jest.useFakeTimers({
      now: FIXED_NOW,
      doNotFake: ['setImmediate', 'nextTick'],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const dueFor = (id: string, uuid: string) => ({
    id,
    uuid,
    organizationId: 'org-1',
    purchaseId: `pu-${id}`,
    commercialCycleId: 'cc-1',
    messageTemplate: 'Gracias por su compra',
    scheduledDate: new Date(),
    purchase: {
      purchaseDate: new Date('2026-10-01T12:00:00.000Z'),
      customer: {
        id: 'cu-1',
        uuid: 'cuu-1',
        phone: '573001112233',
        name: 'Maria Lopez',
        status: 'ACTIVE',
      },
      product: { name: 'Refrigeradora', category: null },
    },
    organization: { name: 'Org Uno' },
    campaignId: null,
    campaign: null,
  });

  it('regresión: no crea un segundo mensaje mientras el primero sigue en vuelo (QUEUED, sentAt NULL)', async () => {
    const { store, autoStatus, prisma, newService } = buildWorld();

    // Worker 1: su proveedor queda colgado, así que A nunca llega a SENT y su
    // fila permanece en QUEUED con sentAt = NULL.
    let releaseA: (v: unknown) => void = () => undefined;
    const hangA = new Promise((resolve) => {
      releaseA = resolve;
    });

    const envio1 = { sendMessage: jest.fn().mockReturnValue(hangA) };
    const envio2 = {
      sendMessage: jest.fn().mockResolvedValue({
        providerMessageId: 'wamid-2',
        providerConversationId: null,
      }),
    };
    const worker1 = newService(envio1);
    const worker2 = newService(envio2);
    prisma.automation.findMany.mockResolvedValue([
      dueFor('a-1', 'au-1'),
      dueFor('a-2', 'au-2'),
    ]);

    const run1 = worker1.executeDueAutomations();
    // Deja que el worker 1 cree el mensaje de A y se quede esperando.
    await new Promise((r) => setImmediate(r));

    // Estado intermedio exigido por la misión: A en vuelo, sentAt = NULL.
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({
      customerId: 'cu-1',
      status: 'QUEUED',
      sentAt: null,
    });
    expect(autoStatus.get('a-1')).toBe('EXECUTING');

    // Worker 2 evalúa a B en ese mismo intervalo.
    await worker2.executeDueAutomations();

    // Sin la guarda, G3 filtra `sentAt NOT NULL`, la fila de A sigue en QUEUED
    // y el guard AU-011 es por automatización y no por cliente: se creaba un
    // segundo mensaje. La guarda de "en vuelo" lo difiere.
    expect(store).toHaveLength(1);
    expect(envio2.sendMessage).not.toHaveBeenCalled();
    // B no se marca fallida: queda SCHEDULED para el siguiente tick.
    expect(autoStatus.get('a-2')).toBe('SCHEDULED');

    releaseA({ providerMessageId: 'wamid-1', providerConversationId: null });
    await run1;
  });

  it('control: cuando A ya está SENT, G3 bloquea a B y no hay duplicado', async () => {
    const { store, provider, prisma, newService } = buildWorld();
    provider.sendMessage.mockResolvedValue({
      providerMessageId: 'wamid-1',
      providerConversationId: null,
    });
    const service = newService();
    prisma.automation.findMany.mockResolvedValue([
      dueFor('a-1', 'au-1'),
      dueFor('a-2', 'au-2'),
    ]);

    await service.executeDueAutomations();

    expect(store).toHaveLength(1);
    expect(store[0].status).toBe('SENT');
    expect(store[0].sentAt).toBeInstanceOf(Date);
  });

  it('identidad ausente no se convierte en autorización de envío (fail-closed)', async () => {
    const { store, provider, prisma, newService } = buildWorld();

    // Datos históricos reales: AUTOMATIC/OUTBOUND con customer_id NULL
    // (8 163/8 163 en producción). Como Prisma omite del `where` un
    // `customerId: undefined`, G3 los ve y debe BLOCKEAR, no permitir.
    store.push({
      id: 'hist-1',
      customerId: null,
      type: 'AUTOMATIC',
      direction: 'OUTBOUND',
      status: 'SENT',
      sentAt: new Date(),
      deletedAt: null,
    });

    const automation = dueFor('a-1', 'au-1');
    automation.purchase.customer.id = undefined as never;
    const service = newService();
    prisma.automation.findMany.mockResolvedValue([automation]);

    await service.executeDueAutomations();

    expect(provider.sendMessage).not.toHaveBeenCalled();
    expect(store.filter((m) => m.id.startsWith('msg-'))).toHaveLength(0);
  });

  it('un mensaje MANUAL en vuelo no bloquea un AUTOMATIC (la política manual no cambia)', async () => {
    const { store, provider, prisma, newService } = buildWorld();

    // Un MANUAL que el asesor acaba de encolar: en vuelo, pero no es
    // automático, así que ni G3 ni la guarda de "en vuelo" pueden contarle.
    store.push({
      id: 'man-1',
      customerId: 'cu-1',
      type: 'MANUAL',
      direction: 'OUTBOUND',
      status: 'QUEUED',
      sentAt: null,
      deletedAt: null,
    });
    provider.sendMessage.mockResolvedValue({
      providerMessageId: 'wamid-1',
      providerConversationId: null,
    });
    const service = newService();
    prisma.automation.findMany.mockResolvedValue([dueFor('a-1', 'au-1')]);

    await service.executeDueAutomations();

    expect(store.filter((m) => m.id.startsWith('msg-'))).toHaveLength(1);
  });

  describe('G3-02 · candado FOR UPDATE por cliente (serialización sin migración)', () => {
    it('bloquea la fila del cliente ANTES de leer el estado en vuelo', async () => {
      const { provider, prisma, tx, newService } = buildWorld();
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
      });
      const service = newService();
      prisma.automation.findMany.mockResolvedValue([dueFor('a-1', 'au-1')]);

      await service.executeDueAutomations();

      // El mismo mock `message` sirve a la lectura G3 del servicio de elegibilidad
      // (fuera de la transacción) y a la consulta "en vuelo" de G3-01 (dentro).
      // Se identifica la de "en vuelo" por su forma exacta —`status: 'QUEUED'` y
      // `select: { id: true }`— y se compara contra ella: el candado debe
      // precederla.
      const idxEnVuelo = tx.message.findFirst.mock.calls.findIndex((call) => {
        const args = call[0] as {
          where?: { status?: unknown; deletedAt?: unknown };
          select?: { id?: boolean };
        };
        return (
          args?.where?.status === 'QUEUED' &&
          args?.where?.deletedAt === null &&
          args?.select?.id === true
        );
      });
      expect(idxEnVuelo).toBeGreaterThanOrEqual(0);

      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const readOrder =
        tx.message.findFirst.mock.invocationCallOrder[idxEnVuelo];
      const writeOrder = tx.message.create.mock.invocationCallOrder[0];

      // Sin candado previo, dos procesos leen a la vez el mismo hueco y ambos
      // insertan: el orden debe ser candado -> lectura -> escritura.
      expect(lockOrder).toBeLessThan(readOrder);
      expect(readOrder).toBeLessThan(writeOrder);
    });

    it('el candado apunta a la fila del cliente exacto y usa FOR UPDATE', async () => {
      const { provider, prisma, tx, newService } = buildWorld();
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
      });
      const service = newService();
      prisma.automation.findMany.mockResolvedValue([dueFor('a-1', 'au-1')]);

      await service.executeDueAutomations();

      // Tagged template: call[0] = strings, call[1] = interpolación.
      const [strings, customerId] = tx.$queryRaw.mock.calls[0] as unknown as [
        TemplateStringsArray,
        string,
      ];
      expect(strings.join('?')).toContain('FOR UPDATE');
      expect(strings.join('?')).toContain('"customers"');
      expect(customerId).toBe('cu-1');
    });

    it('toma el candado aunque no haya mensaje previo (protección de carrera)', async () => {
      const { provider, prisma, tx, newService } = buildWorld();
      provider.sendMessage.mockResolvedValue({
        providerMessageId: 'wamid-1',
        providerConversationId: null,
      });
      const service = newService();
      // Caso feliz: no existe ningún mensaje en vuelo. El candado debe tomarse
      // igualmente; es lo que serializa a un segundo proceso que llegaría en
      // paralelo.
      prisma.automation.findMany.mockResolvedValue([dueFor('a-1', 'au-1')]);

      await service.executeDueAutomations();

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
