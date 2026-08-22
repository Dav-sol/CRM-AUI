import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CampaignsService } from './campaigns.service';

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

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    uuid: 'cu-1',
    organizationId: 'org-1',
    name: 'Campaña repetición',
    description: null,
    type: 'REPURCHASE',
    template: 'Hola {customerName}',
    status: 'DRAFT',
    startAt: null,
    segment: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: {
    campaign: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    automation: {
      findUnique: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
    commercialCycle: {
        findMany: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
      purchase: { findMany: jest.Mock };
      followUpSequence: { findFirst: jest.Mock };
      $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      campaign: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      automation: {
        findUnique: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      commercialCycle: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      purchase: { findMany: jest.fn() },
      followUpSequence: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fns: unknown) => {
        if (typeof fns === 'function') return fns(prisma);
        if (Array.isArray(fns)) {
          for (const fn of fns) await fn;
        }
      }),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  describe('create (US1, FR-001)', () => {
    it('creates a DRAFT campaign, audits and emits CampaignCreated', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);
      prisma.campaign.create.mockResolvedValue({
        ...campaignRow(),
        name: 'Mi campaña',
      });

      const result = await service.create(orgUser, {
        name: 'Mi campaña',
        template: 'Hola {customerName}',
        type: 'MANUAL',
      });

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Mi campaña',
          description: undefined,
          type: 'MANUAL',
          template: 'Hola {customerName}',
          templateD3: undefined,
          templateD180: undefined,
          templateD365: undefined,
          segment: undefined,
          startAt: undefined,
          followUpSequenceId: null,
          status: 'DRAFT',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.create' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignCreated',
        expect.objectContaining({
          payload: expect.objectContaining({
            campaignId: 'cu-1',
            name: 'Mi campaña',
            status: 'DRAFT',
          }) as object,
        }),
      );
      expect(result).toEqual({
        uuid: 'cu-1',
        name: 'Mi campaña',
        status: 'DRAFT',
        organizationId: 'org-1',
        createdAt: expect.any(Date) as unknown,
      });
    });

    it('persists per-stage templates when provided (AU-005)', async () => {
      prisma.campaign.create.mockResolvedValue(campaignRow());

      await service.create(orgUser, {
        name: 'Mi campaña',
        template: 'base',
        templateD3: 'd3',
        templateD180: 'd180',
        templateD365: 'd365',
        type: 'REPURCHASE',
      });

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template: 'base',
          templateD3: 'd3',
          templateD180: 'd180',
          templateD365: 'd365',
        }),
      });
    });

    it('rejects platform users without organization scope', async () => {
      await expect(
        service.create(platformUser, {
          name: 'x',
          template: 't',
          type: 'MANUAL',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });
  });

  describe('list (US2, FR-002)', () => {
    it('rejects invalid sort fields', async () => {
      await expect(
        service.list(orgUser, { sort: 'organizationId' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    });

    it('returns paginated campaigns with stats', async () => {
      prisma.campaign.count.mockResolvedValue(1);
      prisma.campaign.findMany.mockResolvedValue([campaignRow()]);
      prisma.automation.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.list(orgUser, { page: 1, limit: 20 });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            deletedAt: null,
          }) as object,
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          uuid: 'cu-1',
          automationCount: 0,
          executedCount: 0,
        }),
      );
    });
  });

  describe('detail (US2, FR-003)', () => {
    it('throws CAMPAIGN_NOT_FOUND when missing', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.detail(orgUser, 'missing')).rejects.toMatchObject({
        status: 404,
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });

    it('returns detail with template when found', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.automation.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.detail(orgUser, 'cu-1');

      expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'cu-1', organizationId: 'org-1', deletedAt: null },
      });
      expect(result).toEqual(
        expect.objectContaining({
          uuid: 'cu-1',
          template: 'Hola {customerName}',
          updatedAt: expect.any(Date) as unknown,
        }),
      );
    });
  });

  describe('update (US3, FR-004)', () => {
    it('updates only while DRAFT', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.campaign.update.mockResolvedValue({
        ...campaignRow(),
        name: 'Nuevo',
      });

      const result = await service.update(orgUser, 'cu-1', {
        name: 'Nuevo',
        type: 'SPECIAL',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({
          name: 'Nuevo',
          type: 'SPECIAL',
        }) as object,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.update' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignUpdated',
        expect.objectContaining({
          payload: expect.objectContaining({ campaignId: 'cu-1' }) as object,
        }),
      );
      expect(result.name).toBe('Nuevo');
    });

    it('rejects updates when not DRAFT', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );

      await expect(
        service.update(orgUser, 'cu-1', { name: 'x' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
    });

    it('rejects updates for unknown campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(
        service.update(orgUser, 'missing', { name: 'x' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });

  describe('activate (US5, FR-006)', () => {
    it('activates campaign and generates automations inside a transaction', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      let txRef:
        | {
            commercialCycle: { create: jest.Mock; update: jest.Mock };
            automation: { createMany: jest.Mock };
          }
        | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'pu-1',
                  customerId: 'cu-a',
                  purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
                },
                {
                  id: 'pu-2',
                  customerId: 'cu-b',
                  purchaseDate: new Date('2026-08-02T12:00:00.000Z'),
                },
              ]),
            },
            commercialCycle: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest
                .fn()
                .mockResolvedValueOnce({ id: 'cy-1' })
                .mockResolvedValueOnce({ id: 'cy-2' }),
              update: jest.fn(),
            },
            automation: {
              createMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
          };
          txRef = tx;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result).toEqual({
        uuid: 'cu-1',
        status: 'ACTIVE',
        automationCount: 2,
        startedAt: expect.any(Date) as unknown,
      });
      expect(txRef?.commercialCycle.create).toHaveBeenNthCalledWith(1, {
        data: {
          purchaseId: 'pu-1',
          status: 'ACTIVE',
          startDate: new Date('2026-08-01T12:00:00.000Z'),
        },
        select: { id: true },
      });
      expect(txRef?.commercialCycle.create).toHaveBeenNthCalledWith(2, {
        data: {
          purchaseId: 'pu-2',
          status: 'ACTIVE',
          startDate: new Date('2026-08-02T12:00:00.000Z'),
        },
        select: { id: true },
      });
      expect(txRef?.automation.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            purchaseId: 'pu-1',
            commercialCycleId: 'cy-1',
          }),
          expect.objectContaining({
            purchaseId: 'pu-2',
            commercialCycleId: 'cy-2',
          }),
        ]) as unknown[],
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.activate' }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.automations.generated' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignActivated',
        expect.objectContaining({
          payload: expect.objectContaining({ automationCount: 2 }) as object,
        }),
      );
    });

    it('generates one automation per stage with the stage template snapshot (HG-FUS-02)', async () => {
      const warrantyExpires = new Date('2027-08-01T12:00:00.000Z');
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'D-30',
                offsetDays: -30,
                template: 'Recordatorio {customerName}',
              },
              {
                uuid: 'st-2',
                name: 'D0',
                offsetDays: 0,
                template: 'Vence hoy tu {productName}',
              },
            ],
          },
        }),
      );
      let txRef:
        | {
            purchase: { findMany: jest.Mock };
            automation: { create: jest.Mock; createMany: jest.Mock };
          }
        | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn(
                (
                  args?: { select?: Record<string, unknown> },
                ): Promise<unknown> => {
                  if (args?.select && 'warrantyExpiresAt' in args.select) {
                    return Promise.resolve([
                      { id: 'pu-1', warrantyExpiresAt: warrantyExpires },
                    ]);
                  }
                  return Promise.resolve([
                    {
                      id: 'pu-1',
                      customerId: 'cu-a',
                      purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
                    },
                  ]);
                },
              ),
            },
            commercialCycle: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue({ id: 'cy-1' }),
              update: jest.fn(),
            },
            automation: {
              createMany: jest.fn(),
              create: jest.fn().mockResolvedValue({}),
            },
          };
          txRef = tx;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(2);
      expect(txRef?.automation.create).toHaveBeenCalledTimes(2);
      // Snapshot persisted per stage
      expect(txRef?.automation.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          purchaseId: 'pu-1',
          campaignId: 'c-1',
          status: 'SCHEDULED',
          messageTemplate: 'Recordatorio {customerName}',
        }) as unknown,
      });
      expect(txRef?.automation.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          messageTemplate: 'Vence hoy tu {productName}',
        }) as unknown,
      });
      // scheduledDate = warrantyExpiresAt + offsetDays
      const firstCall = txRef!.automation.create.mock.calls[0][0] as {
        data: { scheduledDate: Date };
      };
      const secondCall = txRef!.automation.create.mock.calls[1][0] as {
        data: { scheduledDate: Date };
      };
      const expectedMinus30 = new Date(warrantyExpires);
      expectedMinus30.setDate(expectedMinus30.getDate() - 30);
      const expectedZero = new Date(warrantyExpires);
      expectedZero.setDate(expectedZero.getDate());
      expect(firstCall.data.scheduledDate.getTime()).toBe(
        expectedMinus30.getTime(),
      );
      expect(secondCall.data.scheduledDate.getTime()).toBe(
        expectedZero.getTime(),
      );
      // Legacy single-template bulk path is not used for sequence campaigns
      expect(txRef?.automation.createMany).not.toHaveBeenCalled();
    });

    it('skips purchases without warrantyExpiresAt in sequence campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'D0',
                offsetDays: 0,
                template: 'Vence hoy',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn(
                (
                  args?: { select?: Record<string, unknown> },
                ): Promise<unknown> => {
                  if (args?.select && 'warrantyExpiresAt' in args.select) {
                    return Promise.resolve([
                      { id: 'pu-1', warrantyExpiresAt: null },
                    ]);
                  }
                  return Promise.resolve([
                    {
                      id: 'pu-1',
                      customerId: 'cu-a',
                      purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
                    },
                  ]);
                },
              ),
            },
            commercialCycle: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue({ id: 'cy-1' }),
              update: jest.fn(),
            },
            automation: {
              createMany: jest.fn(),
              create: jest.fn().mockResolvedValue({}),
            },
          };
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(0);
      expect(txAutomationCreate).not.toHaveBeenCalled();
    });

    it('reuses an existing ACTIVE cycle for the purchase', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      let txRef:
        | {
            commercialCycle: { create: jest.Mock; update: jest.Mock };
            automation: { createMany: jest.Mock };
          }
        | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'pu-1',
                  customerId: 'cu-a',
                  purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
                },
              ]),
            },
            commercialCycle: {
              findMany: jest
                .fn()
                .mockResolvedValue([
                  { id: 'cy-1', status: 'ACTIVE', purchaseId: 'pu-1' },
                ]),
              create: jest.fn(),
              update: jest.fn(),
            },
            automation: {
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          txRef = tx;
          return fn(tx);
        },
      );

      await service.activate(orgUser, 'cu-1');

      expect(txRef?.commercialCycle.create).not.toHaveBeenCalled();
      expect(txRef?.commercialCycle.update).not.toHaveBeenCalled();
      expect(txRef?.automation.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ commercialCycleId: 'cy-1' })],
      });
    });

    it('reopens a CANCELLED cycle to ACTIVE before attaching the automation', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      let txRef:
        | {
            commercialCycle: { create: jest.Mock; update: jest.Mock };
            automation: { createMany: jest.Mock };
          }
        | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'pu-1',
                  customerId: 'cu-a',
                  purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
                },
              ]),
            },
            commercialCycle: {
              findMany: jest
                .fn()
                .mockResolvedValue([
                  { id: 'cy-1', status: 'CANCELLED', purchaseId: 'pu-1' },
                ]),
              create: jest.fn(),
              update: jest.fn().mockResolvedValue({ id: 'cy-1' }),
            },
            automation: {
              createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          };
          txRef = tx;
          return fn(tx);
        },
      );

      await service.activate(orgUser, 'cu-1');

      expect(txRef?.commercialCycle.create).not.toHaveBeenCalled();
      expect(txRef?.commercialCycle.update).toHaveBeenCalledWith({
        where: { id: 'cy-1' },
        data: {
          status: 'ACTIVE',
          startDate: new Date('2026-08-01T12:00:00.000Z'),
          endDate: null,
        },
      });
      expect(txRef?.automation.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ commercialCycleId: 'cy-1' })],
      });
    });

    it('rejects activation when not DRAFT', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
    });

    it('rejects activation for unknown campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.activate(orgUser, 'missing')).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });

    it('rejects segments exceeding the automation limit', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'DRAFT' }),
      );
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const purchases = Array.from({ length: 5001 }, (_, i) => ({
            id: `pu-${i}`,
            customerId: `cu-${i}`,
            purchaseDate: new Date(),
          }));
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: { findMany: jest.fn().mockResolvedValue(purchases) },
            automation: { createMany: jest.fn() },
          };
          return fn(tx);
        },
      );

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'SEGMENT_TOO_LARGE' } },
      });
      expect(prisma.automation.createMany).not.toHaveBeenCalled();
    });
  });

  describe('pause / resume (US6, FR-007/FR-008)', () => {
    it('pauses an ACTIVE campaign and emits CampaignUpdated', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );
      prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.pause(orgUser, 'cu-1');

      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
        where: {
          uuid: 'cu-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: { status: 'PAUSED' },
      });
      expect(result.status).toBe('PAUSED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignUpdated',
        expect.anything(),
      );
    });

    it('rejects pause when not ACTIVE', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'DRAFT' }),
      );

      await expect(service.pause(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
    });

    it('rejects pause/resume for unknown campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.pause(orgUser, 'missing')).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
      await expect(service.resume(orgUser, 'missing')).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });

    it('resumes a PAUSED campaign and emits CampaignActivated', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'PAUSED' }),
      );
      prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.resume(orgUser, 'cu-1');

      expect(result.status).toBe('ACTIVE');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignActivated',
        expect.objectContaining({
          payload: expect.objectContaining({
            campaignId: 'cu-1',
            automationCount: 0,
          }) as object,
        }),
      );
    });
  });

  describe('cancel (US7, FR-009)', () => {
    it('cancels campaign and pending automations', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            automation: {
              updateMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.cancel(orgUser, 'cu-1');

      expect(result.status).toBe('CANCELLED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignCancelled',
        expect.objectContaining({
          payload: expect.objectContaining({ campaignId: 'cu-1' }) as object,
        }),
      );
    });

    it('rejects cancel from a terminal state', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'FINISHED' }),
      );

      await expect(service.cancel(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
    });

    it('rejects cancel for unknown campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.cancel(orgUser, 'missing')).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });
  });

  describe('previewSegment (US4, FR-005)', () => {
    it('returns the qualifying purchase count using stored segment', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          segment: { city: 'Lima' } as unknown as Prisma.JsonValue,
        }),
      );
      prisma.purchase.findMany.mockResolvedValue([
        { id: 'pu-1', customerId: 'cu-a', purchaseDate: new Date() },
        { id: 'pu-2', customerId: 'cu-a', purchaseDate: new Date() },
      ]);

      const result = await service.previewSegment(orgUser, 'cu-1');

      expect(result).toEqual({ count: 1 });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.preview_segment' }),
      );
    });

    it('treats an empty explicit segment as absent (falls back to stored)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          segment: { city: 'Lima' } as unknown as Prisma.JsonValue,
        }),
      );
      prisma.purchase.findMany.mockResolvedValue([
        { id: 'pu-1', customerId: 'cu-a', purchaseDate: new Date() },
        { id: 'pu-2', customerId: 'cu-a', purchaseDate: new Date() },
      ]);

      const result = await service.previewSegment(orgUser, 'cu-1', {});

      expect(result).toEqual({ count: 1 });
      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customer: expect.objectContaining({
              city: { contains: 'Lima', mode: 'insensitive' },
            }) as object,
          }) as object,
        }),
      );
    });

    it('applies full segment filters (product, date-only bounds, status)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.purchase.findMany.mockResolvedValue([]);

      const result = await service.previewSegment(orgUser, 'cu-1', {
        city: 'Lima',
        productId: 'prod-1',
        purchaseFrom: '2026-01-01',
        purchaseTo: '2026-01-31',
        customerStatus: 'ACTIVE',
      });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product: { uuid: 'prod-1' },
            purchaseDate: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-01-31T23:59:59.999Z'),
            },
            customer: expect.objectContaining({
              city: { contains: 'Lima', mode: 'insensitive' },
              status: 'ACTIVE',
            }) as object,
          }) as object,
        }),
      );
      expect(result).toEqual({ count: 0 });
    });

    it('rejects preview for unknown campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(
        service.previewSegment(orgUser, 'missing'),
      ).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });
  });

  describe('handleAutomationExecuted (US8, FR-010)', () => {
    it('finishes the campaign when no automations remain', async () => {
      prisma.automation.findUnique.mockResolvedValue({
        campaignId: 'c-1',
        organizationId: 'org-1',
        campaign: { uuid: 'cu-1' },
      });
      prisma.automation.count.mockResolvedValue(0);
      prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

      await service.handleAutomationExecuted({
        payload: { automationId: 'au-1' },
      });

      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-1', status: 'ACTIVE', deletedAt: null },
        data: { status: 'FINISHED' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'campaign.finish' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignFinished',
        expect.objectContaining({
          payload: expect.objectContaining({ campaignId: 'cu-1' }) as object,
        }),
      );
    });

    it('ignores automations without campaign', async () => {
      prisma.automation.findUnique.mockResolvedValue({
        campaignId: null,
        organizationId: 'org-1',
        campaign: null,
      });

      await service.handleAutomationExecuted({
        payload: { automationId: 'au-1' },
      });

      expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing while automations remain', async () => {
      prisma.automation.findUnique.mockResolvedValue({
        campaignId: 'c-1',
        organizationId: 'org-1',
        campaign: { uuid: 'cu-1' },
      });
      prisma.automation.count.mockResolvedValue(2);

      await service.handleAutomationExecuted({
        payload: { automationId: 'au-1' },
      });

      expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    });

    it('does not emit when the finish guard is not won', async () => {
      prisma.automation.findUnique.mockResolvedValue({
        campaignId: 'c-1',
        organizationId: 'org-1',
        campaign: { uuid: 'cu-1' },
      });
      prisma.automation.count.mockResolvedValue(0);
      prisma.campaign.updateMany.mockResolvedValue({ count: 0 });

      await service.handleAutomationExecuted({
        payload: { automationId: 'au-1' },
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('logs and swallows unexpected errors', async () => {
      prisma.automation.findUnique.mockRejectedValue(new Error('db down'));
      const loggerError = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.handleAutomationExecuted({ payload: { automationId: 'au-1' } }),
      ).resolves.toBeUndefined();

      expect(loggerError).toHaveBeenCalled();
      loggerError.mockRestore();
    });
  });

  describe('create — followUpSequenceId persistence', () => {
    it('persists followUpSequenceId when sequence belongs to same org', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue({ id: 'seq-1' });
      prisma.campaign.create.mockResolvedValue({
        ...campaignRow(),
        followUpSequenceId: 'seq-1',
      });

      await service.create(orgUser, {
        name: 'Con secuencia',
        template: 'base',
        type: 'AUTOMATIC',
        followUpSequenceId: 'seq-uuid-1',
      });

      expect(prisma.followUpSequence.findFirst).toHaveBeenCalledWith({
        where: {
          uuid: 'seq-uuid-1',
          organizationId: 'org-1',
          deletedAt: null,
        },
        select: { id: true },
      });
      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ followUpSequenceId: 'seq-1' }),
        }),
      );
    });

    it('rejects followUpSequenceId from different organization', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);

      await expect(
        service.create(orgUser, {
          name: 'Bad seq',
          template: 't',
          type: 'AUTOMATIC',
          followUpSequenceId: 'foreign-seq',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('persists null followUpSequenceId when not provided', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);
      prisma.campaign.create.mockResolvedValue(campaignRow());

      await service.create(orgUser, {
        name: 'Sin secuencia',
        template: 't',
        type: 'MANUAL',
      });

      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ followUpSequenceId: null }),
        }),
      );
    });
  });

  describe('update — followUpSequenceId persistence', () => {
    it('updates followUpSequenceId on existing campaign', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.followUpSequence.findFirst.mockResolvedValue({ id: 'seq-2' });
      prisma.campaign.update.mockResolvedValue({
        ...campaignRow(),
        followUpSequenceId: 'seq-2',
      });

      const result = await service.update(orgUser, 'cu-1', {
        followUpSequenceId: 'seq-uuid-2',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ followUpSequenceId: 'seq-2' }),
        }),
      );
    });

    it('allows removing followUpSequenceId by sending empty string', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.followUpSequence.findFirst.mockResolvedValue(null);
      prisma.campaign.update.mockResolvedValue(campaignRow());

      await service.update(orgUser, 'cu-1', {
        followUpSequenceId: '',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ followUpSequenceId: null }),
        }),
      );
    });
  });

  describe('segment AND logic — productId + warrantyMonths', () => {
    it('activates successfully when segment has both productId and warrantyMonths', async () => {
      prisma.campaign.findFirst
        .mockResolvedValueOnce(campaignRow({ followUpSequenceId: null, followUpSequence: null }))
        .mockResolvedValueOnce(null);
      prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchase.findMany.mockResolvedValue([
        { id: 'pu-1', customerId: 'cust-1', purchaseDate: new Date() },
      ]);
      prisma.commercialCycle.findMany.mockResolvedValue([]);
      prisma.commercialCycle.create.mockResolvedValue({ id: 'cc-1' });
      prisma.automation.createMany.mockResolvedValue({ count: 1 });

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('stage-aware limit calculation', () => {
    it('counts total as customers × stages, not just customers', async () => {
      const stages = [
        { uuid: 's1', name: '3d', offsetDays: 3, template: 't1' },
        { uuid: 's2', name: '6m', offsetDays: 180, template: 't2' },
        { uuid: 's3', name: '12m', offsetDays: 365, template: 't3' },
      ];
      prisma.campaign.findFirst
        .mockResolvedValueOnce(
          campaignRow({ followUpSequenceId: 'seq-1', followUpSequence: { uuid: 'seq-uuid-1', warrantyMonths: 12, stages } }),
        )
        .mockResolvedValueOnce(null);
      prisma.campaign.updateMany.mockResolvedValue({ count: 1 });

      const customers = Array.from({ length: 1700 }, (_, i) => ({
        id: `pu-${i}`,
        customerId: `cust-${i}`,
        purchaseDate: new Date(),
      }));
      prisma.purchase.findMany.mockResolvedValue(customers);
      prisma.commercialCycle.findMany.mockResolvedValue([]);
      prisma.commercialCycle.create.mockResolvedValue({ id: `cc-${0}` });

      await expect(
        service.activate(orgUser, 'cu-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'SEGMENT_TOO_LARGE' } },
      });
    });
  });
});
