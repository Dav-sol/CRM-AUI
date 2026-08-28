import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
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

// Activation requires APPROVED (playbook §20); this builds an approved campaign
// while still allowing tests to override the status explicitly.
function approvedCampaign(overrides: Record<string, unknown> = {}) {
  return campaignRow({ status: 'APPROVED', ...overrides });
}

function sequenceTransaction(
  purchase: { id: string; customerId: string; purchaseDate: string },
  warrantyExpiresAt: Date | null,
) {
  return {
    campaign: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    purchase: {
      findMany: jest.fn(
        (args?: { select?: Record<string, unknown> }): Promise<unknown> => {
          if (args?.select && 'warrantyExpiresAt' in args.select) {
            return Promise.resolve([{ id: purchase.id, warrantyExpiresAt }]);
          }
          return Promise.resolve([
            {
              id: purchase.id,
              customerId: purchase.customerId,
              purchaseDate: new Date(purchase.purchaseDate),
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
      count: jest.fn().mockResolvedValue(0),
    },
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
    message: { count: jest.Mock };
    quote: { aggregate: jest.Mock };
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
      purchase: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(5) },
      message: { count: jest.fn().mockResolvedValue(0) },
      quote: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0, purchaseId: 0 },
          _sum: { value: null },
        }),
      },
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
    prisma.automation.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'journeys.maxCommercialPer60d' ? 3 : null,
            ),
          },
        },
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

      expect(prisma.campaign.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uuid: 'cu-1', organizationId: 'org-1', deletedAt: null },
          include: {
            followUpSequence: expect.objectContaining({
              select: expect.objectContaining({ uuid: true }),
            }),
          },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          uuid: 'cu-1',
          template: 'Hola {customerName}',
          updatedAt: expect.any(Date) as unknown,
          followUpSequence: null,
        }),
      );
    });

    it('returns the linked follow-up sequence on detail', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          followUpSequence: {
            uuid: 'seq-uuid-1',
            name: 'Secuencia Garantía 12',
            warrantyMonths: 12,
            stages: [
              {
                id: 'st-1',
                name: 'Bienvenida',
                anchor: 'PURCHASE_DATE',
                offsetDays: 0,
                template: 'Hola {customerName}',
                templateOnPast: null,
              },
              {
                id: 'st-2',
                name: 'Revisión mitad',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: -180,
                template: 'Revisión gratuita',
                templateOnPast: 'Recompra',
              },
            ],
          },
        }),
      );
      prisma.automation.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.detail(orgUser, 'cu-1');

      expect(result.followUpSequence).toEqual({
        uuid: 'seq-uuid-1',
        name: 'Secuencia Garantía 12',
        warrantyMonths: 12,
        stageCount: 2,
        stages: [
          {
            uuid: 'st-1',
            name: 'Bienvenida',
            anchor: 'PURCHASE_DATE',
            offsetDays: 0,
            template: 'Hola {customerName}',
            templateOnPast: null,
          },
          {
            uuid: 'st-2',
            name: 'Revisión mitad',
            anchor: 'WARRANTY_EXPIRY',
            offsetDays: -180,
            template: 'Revisión gratuita',
            templateOnPast: 'Recompra',
          },
        ],
      });
    });
  });

  describe('update (US3, FR-004)', () => {
    it('rejects an empty body (at least one field required)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());

      await expect(service.update(orgUser, 'cu-1', {})).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('At least one field'),
          },
        },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('updates while DRAFT', async () => {
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

    it('allows ACTIVE campaigns to update template fields', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );
      prisma.campaign.update.mockResolvedValue({
        ...campaignRow({ status: 'ACTIVE' }),
        template: 'Updated template',
      });

      const result = await service.update(orgUser, 'cu-1', {
        template: 'Updated template',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({
          template: 'Updated template',
        }) as object,
      });
      expect(result.name).toBe('Campaña repetición');
    });

    it('rejects segment/stages/startAt changes on ACTIVE campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );

      await expect(
        service.update(orgUser, 'cu-1', { segment: { city: 'Quito' } }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('ACTIVE'),
          },
        },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('rejects updates on PAUSED campaigns', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'PAUSED' }),
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
    it('rejects activation with unknown message variables (P0.2)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          template: 'Hola {customerName} {raro}',
          followUpSequenceId: null,
          followUpSequence: null,
        }),
      );

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Invalid message variables'),
          },
        },
      });
    });

    it('rejects activation when the segment has no audience (P0.2)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequenceId: null,
          followUpSequence: null,
        }),
      );
      prisma.purchase.count.mockResolvedValue(0);

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('without an audience'),
          },
        },
      });
    });
    it('activates campaign and generates automations inside a transaction', async () => {
      prisma.campaign.findFirst.mockResolvedValue(approvedCampaign());
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
              count: jest.fn().mockResolvedValue(0),
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
        skippedByLimit: 0,
        skippedByFrequency: 0,
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
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'D-30',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: -30,
                template: 'Recordatorio {customerName}',
              },
              {
                uuid: 'st-2',
                name: 'D0',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'Vence hoy tu {productName}',
              },
            ],
          },
        }),
      );
      let txRef:
        | {
purchase: { findMany: jest.Mock; count: jest.Mock };
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
                (args?: {
                  select?: Record<string, unknown>;
                }): Promise<unknown> => {
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
              count: jest.fn().mockResolvedValue(0),
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
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'D0',
                anchor: 'WARRANTY_EXPIRY',
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
                (args?: {
                  select?: Record<string, unknown>;
                }): Promise<unknown> => {
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
              count: jest.fn().mockResolvedValue(0),
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

    it('generates PURCHASE_DATE stages even when warrantyExpiresAt is null (HG-SEM-05)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'W',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'w',
              },
              {
                uuid: 'st-2',
                name: 'P',
                anchor: 'PURCHASE_DATE',
                offsetDays: 0,
                template: 'p',
                templateOnPast: 'pr',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2027-01-01T12:00:00.000Z',
            },
            null,
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      expect(txAutomationCreate).toHaveBeenCalledTimes(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { scheduledDate: Date; messageTemplate: string } },
      ];
      expect(call.data.messageTemplate).toBe('p');
      expect(call.data.scheduledDate.getTime()).toBe(
        new Date('2027-01-01T12:00:00.000Z').getTime(),
      );
    });

    it('converts a past WARRANTY_EXPIRY stage into an immediate repurchase automation using templateOnPast (HG-SEM-03)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'W',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'original',
                templateOnPast: 'renovación',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            new Date('2026-01-01T12:00:00.000Z'),
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      expect(txAutomationCreate).toHaveBeenCalledTimes(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { scheduledDate: Date; messageTemplate: string } },
      ];
      expect(call.data.messageTemplate).toBe('renovación');
      expect(call.data.scheduledDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('substitutes later post-warranty recompra stages when a conversion fires (F4)', async () => {
      const warrantyExpired = new Date(Date.now() - 30 * 86_400_000);
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'Vencimiento',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'vence hoy',
                templateOnPast: 'renovación',
              },
              {
                uuid: 'st-2',
                name: 'Post-garantía +90',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 90,
                template: 'renovación post-garantía',
                templateOnPast: null,
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            warrantyExpired,
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      // One renovation contact only: the conversion, not the +90 stage.
      expect(result.automationCount).toBe(1);
      expect(txAutomationCreate).toHaveBeenCalledTimes(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { messageTemplate: string; purpose: string } },
      ];
      expect(call.data.messageTemplate).toBe('renovación');
      expect(call.data.purpose).toBe('COMMERCIAL');
    });

    it('falls back to campaign.template when templateOnPast is missing', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'W',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'original',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            new Date('2026-01-01T12:00:00.000Z'),
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { messageTemplate: string } },
      ];
      expect(call.data.messageTemplate).toBe('Hola {customerName}');
    });

    it('dedupes multiple past WARRANTY_EXPIRY stages into a single repurchase automation per purchase', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'W-30',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: -30,
                template: 't0',
                templateOnPast: 'r0',
              },
              {
                uuid: 'st-2',
                name: 'W0',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 't10',
                templateOnPast: 'r1',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            new Date('2026-01-01T12:00:00.000Z'),
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      expect(txAutomationCreate).toHaveBeenCalledTimes(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { scheduledDate: Date; messageTemplate: string } },
      ];
      expect(call.data.messageTemplate).toBe('r1');
      expect(call.data.scheduledDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('omits past PURCHASE_DATE stages without generating a repurchase', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'P',
                anchor: 'PURCHASE_DATE',
                offsetDays: 0,
                template: 'original',
                templateOnPast: 'recompra',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            null,
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(0);
      expect(txAutomationCreate).not.toHaveBeenCalled();
    });

    it('uses startAt as the reference: past WARRANTY_EXPIRY stages become repurchase at startAt', async () => {
      const startAt = new Date('2026-10-01T12:00:00.000Z');
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          startAt,
          followUpSequence: {
            uuid: 'fus-1',
            warrantyMonths: 12,
            stages: [
              {
                uuid: 'st-1',
                name: 'W',
                anchor: 'WARRANTY_EXPIRY',
                offsetDays: 0,
                template: 'original',
                templateOnPast: 'renovación',
              },
            ],
          },
        }),
      );
      let txAutomationCreate: jest.Mock | undefined;
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = sequenceTransaction(
            {
              id: 'pu-1',
              customerId: 'cu-a',
              purchaseDate: '2026-01-01T12:00:00.000Z',
            },
            new Date('2026-01-01T12:00:00.000Z'),
          );
          txAutomationCreate = tx.automation.create;
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.automationCount).toBe(1);
      const [call] = txAutomationCreate!.mock.calls[0] as [
        { data: { scheduledDate: Date; messageTemplate: string } },
      ];
      expect(call.data.scheduledDate.getTime()).toBe(startAt.getTime());
      expect(call.data.messageTemplate).toBe('renovación');
    });

    it('reuses an existing ACTIVE cycle for the purchase', async () => {
      prisma.campaign.findFirst.mockResolvedValue(approvedCampaign());
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
              count: jest.fn().mockResolvedValue(0),
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
      prisma.campaign.findFirst.mockResolvedValue(approvedCampaign());
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
              count: jest.fn().mockResolvedValue(0),
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
        approvedCampaign({ status: 'ACTIVE' }),
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
      prisma.campaign.findFirst.mockResolvedValue(approvedCampaign());
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
            count: jest.fn().mockResolvedValue(0),
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
              count: jest.fn().mockResolvedValue(0),
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

      expect(result).toEqual({
        count: 1,
        estimatedAutomations: 1,
        estimatedCost: 400,
      });
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

      expect(result).toEqual({
        count: 1,
        estimatedAutomations: 1,
        estimatedCost: 400,
      });
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
      expect(result).toEqual({
        count: 0,
        estimatedAutomations: 0,
        estimatedCost: 0,
      });
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
        .mockResolvedValueOnce(
          approvedCampaign({
            followUpSequenceId: null,
            followUpSequence: null,
          }),
        )
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
          approvedCampaign({
            followUpSequenceId: 'seq-1',
            followUpSequence: {
              uuid: 'seq-uuid-1',
              warrantyMonths: 12,
              stages,
            },
          }),
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

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'SEGMENT_TOO_LARGE' } },
      });
    });
  });

  describe('approve (playbook §20)', () => {
    it('rejects approval when the template has unknown variables (P0.2)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ template: 'Hola {customerName} {desconocida}' }),
      );

      await expect(service.approve(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Invalid message variables'),
          },
        },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('rejects approval when there are no messages (P0.2)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ template: '', templateD3: '', templateD180: '', templateD365: '' }),
      );

      await expect(service.approve(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('no messages'),
          },
        },
      });
    });

    it('rejects approval when the segment has no audience (P0.2)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.purchase.count.mockResolvedValue(0);

      await expect(service.approve(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('without an audience'),
          },
        },
      });
    });

    it('approves a DRAFT campaign, audits and emits CampaignUpdated', async () => {
      prisma.campaign.findFirst.mockResolvedValue(campaignRow());
      prisma.campaign.update.mockResolvedValue({
        ...campaignRow(),
        status: 'APPROVED',
        updatedAt: new Date(),
      });

      const result = await service.approve(orgUser, 'cu-1');

      expect(result.status).toBe('APPROVED');
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: 'APPROVED' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'campaign.approved',
          outcome: 'success',
          organizationId: 'org-1',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CampaignUpdated',
        expect.objectContaining({
          payload: expect.objectContaining({ campaignId: 'cu-1' }) as object,
        }),
      );
    });

    it('rejects approving a non-DRAFT campaign', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ status: 'ACTIVE' }),
      );

      await expect(service.approve(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('rejects approving an unknown campaign', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.approve(orgUser, 'cu-1')).rejects.toMatchObject({
        response: { error: { code: 'CAMPAIGN_NOT_FOUND' } },
      });
    });
  });

  // Fase 1: etapas inline del timeline del editor (Campaign.stages Json).
  describe('inline stages (Fase 1)', () => {
    const inlineStages = [
      {
        name: 'Bienvenida',
        anchor: 'PURCHASE_DATE' as const,
        offsetDays: 0,
        template: 'Hola {customerName}, tu {productName}…',
      },
      {
        anchor: 'WARRANTY_EXPIRY' as const,
        offsetDays: -30,
        template: '{customerName}, tu garantía vence pronto',
        templateOnPast: 'Oferta de renovación para {customerName}',
      },
    ];

    it('creates a campaign with inline stages', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);
      prisma.campaign.create.mockResolvedValue(campaignRow());

      await service.create(orgUser, {
        name: 'Con etapas',
        template: 'Hola {customerName}',
        type: 'AUTOMATIC',
        stages: inlineStages,
      });

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stages: inlineStages }) as object,
      });
    });

    it('rejects create combining followUpSequenceId with inline stages', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);

      await expect(
        service.create(orgUser, {
          name: 'Inválida',
          template: 'Hola {customerName}',
          type: 'AUTOMATIC',
          followUpSequenceId: 'seq-1',
          stages: inlineStages,
        }),
      ).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it('persists stage changes on update (DRAFT/APPROVED)', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({
          status: 'APPROVED',
          followUpSequenceId: null,
          followUpSequence: null,
        }),
      );
      prisma.campaign.update.mockResolvedValue(campaignRow());

      await service.update(orgUser, 'cu-1', { stages: inlineStages });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({ stages: inlineStages }) as object,
      });
    });

    it('clears inline stages on update with an empty array', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ followUpSequenceId: null, followUpSequence: null }),
      );
      prisma.campaign.update.mockResolvedValue(campaignRow());

      await service.update(orgUser, 'cu-1', { stages: [] });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({ stages: [] }) as object,
      });
    });

    it('rejects update adding inline stages to a campaign with a sequence', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        campaignRow({ followUpSequenceId: 7, followUpSequence: null }),
      );

      await expect(
        service.update(orgUser, 'cu-1', { stages: inlineStages }),
      ).rejects.toMatchObject({
        response: { error: { code: 'VALIDATION_ERROR' } },
      });
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('activates with inline stages generating one automation per stage', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequenceId: null,
          followUpSequence: null,
          stages: [
            {
              name: 'D0',
              anchor: 'PURCHASE_DATE',
              offsetDays: 0,
              template: 'Hola {customerName}',
              templateOnPast: null,
            },
            {
              name: 'Pre-vencimiento',
              anchor: 'WARRANTY_EXPIRY',
              offsetDays: -30,
              template: 'Garantía de {productName}',
              templateOnPast: null,
            },
          ],
        }),
      );
      let createCalls: Array<Record<string, unknown>> = [];
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            campaign: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            purchase: {
              findMany: jest.fn(
                (args?: { select?: Record<string, unknown> }): Promise<unknown> => {
                  if (args?.select && 'warrantyExpiresAt' in args.select) {
                    return Promise.resolve([
                      {
                        id: 'pu-1',
                        warrantyExpiresAt: new Date('2027-08-01T00:00:00.000Z'),
                      },
                    ]);
                  }
                  return Promise.resolve([
                    {
                      id: 'pu-1',
                      customerId: 'cus-1',
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
              count: jest.fn().mockResolvedValue(0),
              create: jest
                .fn()
                .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
                  createCalls.push(data);
                  return { id: 'au-1' };
                }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.activate(orgUser, 'cu-1');

      expect(result.status).toBe('ACTIVE');
      // La etapa PURCHASE_DATE +0 quedó en el pasado (compra 2026-08-01 <
      // referencia hoy) → omitida (HG-SEM-03). Solo se genera la etapa de
      // vencimiento −30 días.
      expect(result.automationCount).toBe(1);
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0].scheduledDate).toEqual(
        new Date('2027-07-02T00:00:00.000Z'),
      );
      expect(createCalls[0].purpose).toBe('TRANSACTIONAL');
      expect(createCalls[0].messageTemplate).toBe(
        'Garantía de {productName}',
      );
    });

    it('rejects activation when inline stages contain invalid variables', async () => {
      prisma.campaign.findFirst.mockResolvedValue(
        approvedCampaign({
          followUpSequenceId: null,
          followUpSequence: null,
          stages: [
            {
              name: 'Mala',
              anchor: 'PURCHASE_DATE',
              offsetDays: 0,
              template: 'Hola {variableDesconocida}',
              templateOnPast: null,
            },
          ],
        }),
      );

      await expect(service.activate(orgUser, 'cu-1')).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Invalid message variables'),
          },
        },
      });
    });
  });
});
