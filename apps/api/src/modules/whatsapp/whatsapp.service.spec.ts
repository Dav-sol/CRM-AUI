import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { WhatsappService } from './whatsapp.service';
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
    automation: { findMany: jest.Mock };
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
    };
    customer: { findMany: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let provider: { sendMessage: jest.Mock };
  let configService: { get: jest.Mock };

  const emittedNames = (): string[] =>
    eventEmitter.emit.mock.calls.map((call) => (call as string[])[0]);

  beforeEach(async () => {
    prisma = {
      automation: { findMany: jest.fn() },
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
      },
      customer: { findMany: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    provider = { sendMessage: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'whatsapp.defaultOrganizationId') {
          return 'org-1';
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WHATSAPP_PROVIDER, useValue: provider as WhatsAppProvider },
        { provide: ConfigService, useValue: configService },
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
    }) => ({
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
        create: jest.fn().mockResolvedValue({
          id: 'msg-1',
          uuid: 'msg-uuid-1',
        }),
      },
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
          expect.stringContaining(entry.expected),
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

      expect(provider.sendMessage).toHaveBeenCalledWith('573000000000', 'Hola');
      expect(result).toEqual(
        expect.objectContaining({ uuid: 'msg-uuid-1', status: 'SENT' }),
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

      expect(provider.sendMessage).toHaveBeenCalledWith('573000000000', 'Hola');
      expect(emittedNames()).toContain('MessageQueued');
      expect(result).toEqual(expect.objectContaining({ status: 'SENT' }));
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

    it('opens a conversation with customerId null for an unknown number (HG-8)', async () => {
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
        providerMessageId: 'wamid.in.2',
        from: '579999999999',
        text: 'Quien es',
        timestamp: '1755000000',
        providerConversationId: null,
      });

      const txCalls = prisma.$transaction.mock.calls as unknown[][];
      const createCall = txCalls[0][0] as (tx: unknown) => Promise<unknown>;
      const conversationCreate = (await createCall({
        conversation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'conv-1',
            uuid: 'conv-uuid-1',
          }),
        },
      })) as { conversation: unknown };
      expect(conversationCreate).toBeDefined();
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
});
