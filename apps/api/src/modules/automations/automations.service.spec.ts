import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { AutomationsService } from './automations.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const platformUser: AuthUser = {
  id: 'u-2',
  uuid: 'uu-2',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
};

const baseDate = new Date('2026-08-01T12:00:00.000Z');

describe('AutomationsService', () => {
  let service: AutomationsService;
  let prisma: {
    commercialCycle: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    automation: {
      findFirst: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    purchase: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      commercialCycle: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      automation: {
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      purchase: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AutomationsService>(AutomationsService);
  });

  describe('onPurchaseImported (AU-001)', () => {
    it('creates one ACTIVE cycle and three SCHEDULED automations', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue(null);
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'pu-1',
        uuid: 'puu-1',
        organizationId: 'org-1',
        customerId: 'cu-1',
        purchaseDate: baseDate,
      });
      prisma.commercialCycle.findFirst.mockResolvedValue(null);
      let txAutomationCreate: jest.Mock = jest.fn();
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            automation: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn().mockResolvedValue({
                id: 'a-1',
                uuid: 'au-1',
                organizationId: 'org-1',
                purchaseId: 'pu-1',
                commercialCycleId: 'cc-1',
                scheduledDate: new Date('2026-08-04T12:00:00.000Z'),
                status: 'SCHEDULED',
                priority: 0,
              }),
            },
            commercialCycle: {
              update: jest.fn(),
              create: jest.fn().mockResolvedValue({
                id: 'cc-1',
                uuid: 'ccu-1',
                purchaseId: 'pu-1',
                status: 'ACTIVE',
                startDate: baseDate,
              }),
            },
          };
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      await service.onPurchaseImported({
        payload: { purchaseId: 'pu-1', invoiceNumber: 'F-1' },
      });

      expect(prisma.commercialCycle.findUnique).toHaveBeenCalledWith({
        where: { purchaseId: 'pu-1' },
        select: { id: true },
      });
      expect(prisma.purchase.findUnique).toHaveBeenCalledWith({
        where: { id: 'pu-1' },
        include: { customer: { select: { id: true } } },
      });
      expect(txAutomationCreate).toHaveBeenCalledTimes(3);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'automations',
          action: 'automation.cycle.created',
          outcome: 'success',
          userId: null,
          organizationId: 'org-1',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CommercialCycleStarted',
        expect.objectContaining({
          module: 'automations',
          payload: expect.objectContaining({
            cycleId: 'ccu-1',
            purchaseId: 'puu-1',
          }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'AutomationCreated',
        expect.objectContaining({
          module: 'automations',
          payload: expect.objectContaining({
            commercialCycleId: 'ccu-1',
          }) as object,
        }),
      );
    });

    it('is a no-op when a cycle already exists (idempotent, 07:375-379)', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({ id: 'cc-1' });

      await service.onPurchaseImported({
        payload: { purchaseId: 'pu-1' },
      });

      expect(prisma.purchase.findUnique).not.toHaveBeenCalled();
      expect(prisma.automation.create).not.toHaveBeenCalled();
    });

    it('is a no-op when the purchase does not exist', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue(null);
      prisma.purchase.findUnique.mockResolvedValue(null);

      await service.onPurchaseImported({
        payload: { purchaseId: 'pu-x' },
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cancels the previous ACTIVE cycle and its pending automations (AU-003)', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValueOnce(null);
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'pu-2',
        uuid: 'puu-2',
        organizationId: 'org-1',
        customerId: 'cu-1',
        purchaseDate: baseDate,
      });
      prisma.commercialCycle.findFirst.mockResolvedValue({ id: 'cc-old' });
      let cancelledOld = false;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            automation: {
              findMany: jest.fn().mockResolvedValue([
                {
                  uuid: 'au-old-1',
                  purchaseId: 'pu-2',
                  commercialCycleId: 'cc-old',
                  scheduledDate: baseDate,
                  status: 'SCHEDULED',
                },
                {
                  uuid: 'au-old-2',
                  purchaseId: 'pu-2',
                  commercialCycleId: 'cc-old',
                  scheduledDate: baseDate,
                  status: 'PENDING',
                },
              ]),
              updateMany: jest.fn().mockImplementation(() => {
                cancelledOld = true;
                return Promise.resolve({ count: 2 });
              }),
              create: jest.fn().mockResolvedValue({
                id: 'a-2',
                uuid: 'au-2',
                organizationId: 'org-1',
                purchaseId: 'pu-2',
                commercialCycleId: 'cc-2',
                scheduledDate: baseDate,
                status: 'SCHEDULED',
                priority: 0,
              }),
            },
            commercialCycle: {
              update: jest.fn().mockImplementation(() => {
                cancelledOld = true;
                return Promise.resolve({});
              }),
              create: jest.fn().mockResolvedValue({
                id: 'cc-2',
                uuid: 'ccu-2',
                purchaseId: 'pu-2',
                status: 'ACTIVE',
                startDate: baseDate,
              }),
            },
          };
          return fn(tx);
        },
      );
      prisma.automation.create.mockResolvedValue({
        id: 'a-2',
        uuid: 'au-2',
        status: 'SCHEDULED',
      });
      prisma.commercialCycle.findUnique.mockResolvedValue({
        id: 'cc-old',
        uuid: 'ccu-old',
        endDate: new Date(),
      });

      await service.onPurchaseImported({
        payload: { purchaseId: 'pu-2' },
      });

      expect(cancelledOld).toBe(true);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'automation.cycle.cancelled',
          outcome: 'success',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CommercialCycleCancelled',
        expect.objectContaining({
          payload: expect.objectContaining({ cycleId: 'ccu-old' }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'AutomationCancelled',
        expect.objectContaining({
          payload: expect.objectContaining({
            automationId: 'au-old-1',
          }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'AutomationCancelled',
        expect.objectContaining({
          payload: expect.objectContaining({
            automationId: 'au-old-2',
          }) as object,
        }),
      );
    });

    it('swallows concurrent P2002 races as a no-op (R-008)', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue(null);
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'pu-3',
        uuid: 'puu-3',
        organizationId: 'org-1',
        customerId: 'cu-1',
        purchaseDate: baseDate,
      });
      prisma.commercialCycle.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.onPurchaseImported({ payload: { purchaseId: 'pu-3' } }),
      ).resolves.toBeUndefined();
    });
  });

  describe('listCycles (US3)', () => {
    it('scopes cycles by the purchase organization', async () => {
      prisma.commercialCycle.count.mockResolvedValue(2);
      prisma.commercialCycle.findMany.mockResolvedValue([
        {
          uuid: 'cc-1',
          status: 'ACTIVE',
          startDate: baseDate,
          endDate: null,
          purchaseId: 'pu-1',
          createdAt: baseDate,
          purchase: { uuid: 'puu-1' },
        },
      ]);

      const result = await service.listCycles(orgUser, {});

      expect(prisma.commercialCycle.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          purchase: { organizationId: 'org-1' },
        },
      });
      expect(prisma.commercialCycle.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, purchase: { organizationId: 'org-1' } },
        include: { purchase: { select: { uuid: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.data[0].purchaseId).toBe('puu-1');
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    });

    it('lets PLATFORM_OWNER list all cycles without org scope', async () => {
      prisma.commercialCycle.count.mockResolvedValue(0);
      prisma.commercialCycle.findMany.mockResolvedValue([]);

      await service.listCycles(platformUser, {});

      expect(prisma.commercialCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        }),
      );
    });

    it('filters by status, customer and purchase with date-only boundaries', async () => {
      prisma.commercialCycle.count.mockResolvedValue(0);
      prisma.commercialCycle.findMany.mockResolvedValue([]);

      await service.listCycles(orgUser, {
        status: 'ACTIVE',
        customerId: 'cu-9',
        purchaseId: 'puu-9',
        createdFrom: '2026-08-01',
        createdTo: '2026-08-15',
      });

      expect(prisma.commercialCycle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            purchase: {
              organizationId: 'org-1',
              customer: { uuid: 'cu-9' },
              uuid: 'puu-9',
            },
            status: 'ACTIVE',
            createdAt: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-15T23:59:59.999Z'),
            },
          },
        }),
      );
    });

    it('rejects a non-whitelisted sort field', async () => {
      prisma.commercialCycle.count.mockResolvedValue(0);
      prisma.commercialCycle.findMany.mockResolvedValue([]);

      await expect(
        service.listCycles(orgUser, { sort: 'secret' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getCycle (US3)', () => {
    it('returns the cycle detail with its automations scoped to the org', async () => {
      prisma.commercialCycle.findFirst.mockResolvedValue({
        uuid: 'cc-1',
        status: 'ACTIVE',
        startDate: baseDate,
        endDate: null,
        purchaseId: 'pu-1',
        createdAt: baseDate,
        purchase: { uuid: 'puu-1' },
        automations: [
          {
            uuid: 'au-1',
            status: 'SCHEDULED',
            scheduledDate: baseDate,
            executedDate: null,
            priority: 0,
            purchaseId: 'pu-1',
            commercialCycleId: 'cc-1',
            createdAt: baseDate,
            purchase: { uuid: 'puu-1' },
            commercialCycle: { uuid: 'ccu-1' },
          },
        ],
      });

      const result = await service.getCycle(orgUser, 'ccu-1');

      expect(prisma.commercialCycle.findFirst).toHaveBeenCalledWith({
        where: {
          uuid: 'ccu-1',
          deletedAt: null,
          purchase: { organizationId: 'org-1' },
        },
        include: expect.any(Object) as unknown,
      });
      expect(result?.automations).toHaveLength(1);
      expect(result?.automations[0].commercialCycleId).toBe('ccu-1');
    });

    it('returns null for cross-tenant or unknown cycles', async () => {
      prisma.commercialCycle.findFirst.mockResolvedValue(null);

      await expect(service.getCycle(orgUser, 'missing')).resolves.toBeNull();
    });
  });

  describe('listAutomations (US4)', () => {
    it('scopes by organizationId and applies filters', async () => {
      prisma.automation.count.mockResolvedValue(1);
      prisma.automation.findMany.mockResolvedValue([
        {
          uuid: 'au-1',
          status: 'SCHEDULED',
          scheduledDate: baseDate,
          executedDate: null,
          priority: 0,
          purchaseId: 'pu-1',
          commercialCycleId: 'cc-1',
          createdAt: baseDate,
          purchase: { uuid: 'puu-1' },
          commercialCycle: { uuid: 'ccu-1' },
        },
      ]);

      const result = await service.listAutomations(orgUser, {
        status: 'SCHEDULED',
        scheduledFrom: '2026-08-01',
      });

      expect(prisma.automation.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          organizationId: 'org-1',
          status: 'SCHEDULED',
          scheduledDate: { gte: new Date('2026-08-01T00:00:00.000Z') },
        },
      });
      expect(result.data[0].commercialCycleId).toBe('ccu-1');
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
    });

    it('filters by campaignId when provided (G4)', async () => {
      prisma.automation.count.mockResolvedValue(1);
      prisma.automation.findMany.mockResolvedValue([
        {
          uuid: 'au-1',
          status: 'SCHEDULED',
          scheduledDate: baseDate,
          executedDate: null,
          priority: 0,
          purchaseId: 'pu-1',
          commercialCycleId: 'cc-1',
          createdAt: baseDate,
          purchase: { uuid: 'puu-1' },
          commercialCycle: { uuid: 'ccu-1' },
        },
      ]);

      const result = await service.listAutomations(orgUser, {
        campaignId: 'camp-uuid-1',
      });

      expect(prisma.automation.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          organizationId: 'org-1',
          campaign: { uuid: 'camp-uuid-1' },
        },
      });
      expect(result.data).toHaveLength(1);
    });

    it('lets PLATFORM_OWNER list without org scope', async () => {
      prisma.automation.count.mockResolvedValue(0);
      prisma.automation.findMany.mockResolvedValue([]);

      await service.listAutomations(platformUser, {});

      expect(prisma.automation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });
  });

  describe('getAutomation (US4)', () => {
    it('returns the automation detail with purchase and customer summaries', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        uuid: 'au-1',
        organizationId: 'org-1',
        campaignId: null,
        purchaseId: 'pu-1',
        commercialCycleId: 'cc-1',
        scheduledDate: baseDate,
        executedDate: null,
        status: 'SCHEDULED',
        priority: 0,
        createdAt: baseDate,
        purchase: {
          uuid: 'puu-1',
          invoiceNumber: 'F-1',
          purchaseDate: baseDate,
          product: { name: 'Batería X' },
          customer: { uuid: 'cuu-1', name: 'Ana', phone: '555' },
        },
        commercialCycle: { uuid: 'ccu-1' },
      });

      const result = await service.getAutomation(orgUser, 'au-1');

      expect(prisma.automation.findFirst).toHaveBeenCalledWith({
        where: {
          uuid: 'au-1',
          organizationId: 'org-1',
          deletedAt: null,
        },
        include: expect.any(Object) as unknown,
      });
      expect(result?.purchase.productName).toBe('Batería X');
      expect(result?.customer.name).toBe('Ana');
    });
  });

  describe('cancelAutomation (US5)', () => {
    it('cancels a SCHEDULED automation and emits AutomationCancelled', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        id: 'a-1',
        uuid: 'au-1',
        organizationId: 'org-1',
        campaignId: null,
        purchaseId: 'pu-1',
        commercialCycleId: 'cc-1',
        scheduledDate: baseDate,
        executedDate: null,
        status: 'SCHEDULED',
        priority: 0,
        createdAt: baseDate,
      });
      prisma.automation.update.mockResolvedValue({
        id: 'a-1',
        uuid: 'au-1',
        organizationId: 'org-1',
        campaignId: null,
        purchaseId: 'pu-1',
        commercialCycleId: 'cc-1',
        scheduledDate: baseDate,
        executedDate: null,
        status: 'CANCELLED',
        priority: 0,
        createdAt: baseDate,
        purchase: {
          uuid: 'puu-1',
          invoiceNumber: 'F-1',
          purchaseDate: baseDate,
          product: { name: 'Batería X' },
          customer: { uuid: 'cuu-1', name: 'Ana', phone: '555' },
        },
        commercialCycle: { uuid: 'ccu-1' },
      });

      const result = await service.cancelAutomation(orgUser, { uuid: 'au-1' });

      expect(prisma.automation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CANCELLED', updatedBy: 'u-1' },
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'automation.cancelled',
          outcome: 'success',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'AutomationCancelled',
        expect.objectContaining({
          module: 'automations',
          payload: expect.objectContaining({ automationId: 'au-1' }) as object,
        }),
      );
      expect(result.status).toBe('CANCELLED');
    });

    it('returns 404 for cross-tenant, missing or soft-deleted automations', async () => {
      prisma.automation.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelAutomation(orgUser, { uuid: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'automation.cancelled',
          outcome: 'failure',
          metadata: { reason: 'not_found' },
        }),
      );
    });

    it('rejects cancelling an EXECUTED or CANCELLED automation (AU-004)', async () => {
      prisma.automation.findFirst.mockResolvedValue({
        id: 'a-2',
        uuid: 'au-2',
        organizationId: 'org-1',
        status: 'EXECUTED',
      });

      await expect(
        service.cancelAutomation(orgUser, { uuid: 'au-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.automation.update).not.toHaveBeenCalled();
    });
  });

  describe('audit resilience (US6)', () => {
    it('never breaks the consumer when the audit record fails', async () => {
      const failingAudit = {
        record: jest.fn().mockRejectedValue(new Error('x')),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AutomationsService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditIdentityService, useValue: failingAudit },
          { provide: EventEmitter2, useValue: eventEmitter },
        ],
      }).compile();
      const svc = module.get<AutomationsService>(AutomationsService);

      prisma.commercialCycle.findUnique.mockResolvedValue(null);
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'pu-4',
        uuid: 'puu-4',
        organizationId: 'org-1',
        customerId: 'cu-1',
        purchaseDate: baseDate,
      });
      prisma.commercialCycle.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            automation: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn().mockResolvedValue({
                id: 'a-4',
                uuid: 'au-4',
                organizationId: 'org-1',
                purchaseId: 'pu-4',
                commercialCycleId: 'cc-4',
                scheduledDate: baseDate,
                status: 'SCHEDULED',
                priority: 0,
              }),
            },
            commercialCycle: {
              update: jest.fn(),
              create: jest.fn().mockResolvedValue({
                id: 'cc-4',
                uuid: 'ccu-4',
                status: 'ACTIVE',
                startDate: baseDate,
              }),
            },
          };
          return fn(tx);
        },
      );

      await expect(
        svc.onPurchaseImported({ payload: { purchaseId: 'pu-4' } }),
      ).resolves.toBeUndefined();
    });
  });
});
