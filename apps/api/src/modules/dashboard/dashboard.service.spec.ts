import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { DashboardService } from './dashboard.service';

/**
 * Inicios de mes UTC en los que puede caer la llamada.
 *
 * El servicio calcula el corte del mes con su PROPIO `new Date()`, unas
 * microsegundos despues de que el test tome la referencia: si el reloj cruza
 * el cambio de mes entre ambas llamadas, los dos valores difieren y el test
 * fallaria sin que hubiera cambiado nada del codigo. Se aceptan por eso los
 * dos inicios posibles (el actual y el siguiente), sin perder la asercion: el
 * corte debe seguir siendo un inicio de mes UTC, y un servicio que usara el
 * mes anterior o la hora local seguiria fallando.
 */
function utcMonthStarts(): Date[] {
  const now = new Date();
  return [
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  ];
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    customer: { count: jest.Mock; findMany: jest.Mock };
    purchase: {
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    automation: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    message: { count: jest.Mock };
    conversation: { count: jest.Mock };
    quote: { findMany: jest.Mock };
    campaign: { count: jest.Mock; findMany: jest.Mock };
    audit: { findMany: jest.Mock };
  };

  const orgUser = {
    id: 'u-1',
    uuid: 'uu-1',
    accountType: 'ORGANIZATION' as const,
    organizationId: 'org-1',
    role: 'OPERADOR' as const,
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchase: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { value: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      automation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: { count: jest.fn().mockResolvedValue(0) },
      conversation: { count: jest.fn().mockResolvedValue(0) },
      quote: { findMany: jest.fn().mockResolvedValue([]) },
      campaign: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      audit: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  describe('summary (US1, FR-001, HG-3 semantics)', () => {
    it('computes all KPIs from org-scoped counts, with range + deltas', async () => {
      prisma.customer.count
        .mockResolvedValueOnce(128) // total
        .mockResolvedValueOnce(9) // newThisMonth
        .mockResolvedValueOnce(3) // newInRange
        .mockResolvedValueOnce(1); // newPrev
      prisma.purchase.count
        .mockResolvedValueOnce(342) // total
        .mockResolvedValueOnce(41) // thisMonth
        .mockResolvedValueOnce(17) // inRange
        .mockResolvedValueOnce(10); // prev
      prisma.purchase.aggregate
        .mockResolvedValueOnce({ _sum: { value: { toNumber: () => 5000 } } })
        .mockResolvedValueOnce({ _sum: { value: { toNumber: () => 4000 } } });
      prisma.automation.count
        .mockResolvedValueOnce(27) // scheduled
        .mockResolvedValueOnce(5) // executedInRange
        .mockResolvedValueOnce(2); // executedPrev
      prisma.message.count
        .mockResolvedValueOnce(96) // sent
        .mockResolvedValueOnce(4) // pending
        .mockResolvedValueOnce(30) // sentInRange
        .mockResolvedValueOnce(20); // sentPrev
      prisma.conversation.count.mockResolvedValue(6);
      prisma.campaign.count.mockResolvedValue(2);

      const result = await service.summary(orgUser, {
        from: '2026-08-01',
        to: '2026-08-31',
        compareFrom: '2026-07-01',
        compareTo: '2026-07-31',
      });

      expect(result).toEqual({
        customers: {
          total: 128,
          newThisMonth: 9,
          newInRange: 3,
          newDelta: 200,
        },
        purchases: {
          total: 342,
          thisMonth: 41,
          inRange: 17,
          countDelta: 70,
          value: 5000,
          valueDelta: 25,
        },
        automations: { scheduled: 27, executedInRange: 5, executedDelta: 150 },
        messages: { sent: 96, pending: 4, sentInRange: 30, sentDelta: 50 },
        conversations: { open: 6 },
        campaigns: { active: 2 },
      });
    });

    it('scopes every query to the JWT organization with deletedAt: null', async () => {
      await service.summary(orgUser);

      expect(prisma.customer.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.purchase.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.automation.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          status: 'SCHEDULED',
        },
      });
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null, status: 'SENT' },
      });
      expect(prisma.message.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          status: 'QUEUED',
        },
      });
      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null, status: 'OPEN' },
      });
      expect(prisma.campaign.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null, status: 'ACTIVE' },
      });
    });

    it('uses the UTC calendar month start for newThisMonth (customer.createdAt)', async () => {
      await service.summary(orgUser);

      // El servicio hace varias consultas `count`; se localiza la que lleva
      // el corte de mes en vez de depender del orden de las llamadas.
      const countCalls = prisma.customer.count.mock.calls as unknown[][];
      const monthly = countCalls
        .map((call) => call[0] as { where?: { createdAt?: { gte?: Date } } })
        .find((call) => call.where?.createdAt?.gte !== undefined);
      expect(monthly).toBeDefined();
      const gte = monthly!.where!.createdAt!.gte!;

      expect(prisma.customer.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: { gte },
        },
      });
      expect(utcMonthStarts()).toContainEqual(gte);
    });

    it('uses purchaseDate (not createdAt) for thisMonth purchases', async () => {
      await service.summary(orgUser);

      const countCalls = prisma.purchase.count.mock.calls as unknown[][];
      const monthly = countCalls
        .map((call) => call[0] as { where?: { purchaseDate?: { gte?: Date } } })
        .find((call) => call.where?.purchaseDate?.gte !== undefined);
      expect(monthly).toBeDefined();
      const gte = monthly!.where!.purchaseDate!.gte!;

      expect(prisma.purchase.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: { gte },
        },
      });
      expect(utcMonthStarts()).toContainEqual(gte);
    });

    it('runs all counts in parallel (Promise.all, no N+1)', async () => {
      const seen: number[] = [];
      prisma.customer.count.mockImplementation(() => {
        seen.push(1);
        return Promise.resolve(0);
      });
      prisma.purchase.count.mockImplementation(() => {
        seen.push(2);
        return Promise.resolve(0);
      });
      prisma.purchase.aggregate.mockImplementation(() => {
        seen.push(2);
        return Promise.resolve({ _sum: { value: null } });
      });
      prisma.automation.count.mockImplementation(() => {
        seen.push(3);
        return Promise.resolve(0);
      });
      prisma.message.count.mockImplementation(() => {
        seen.push(4);
        return Promise.resolve(0);
      });
      prisma.conversation.count.mockImplementation(() => {
        seen.push(5);
        return Promise.resolve(0);
      });
      prisma.campaign.count.mockImplementation(() => {
        seen.push(6);
        return Promise.resolve(0);
      });

      await service.summary(orgUser);

      // No comparison range: 3 customer.count + 3 purchase.count +
      // 1 purchase.aggregate + 2 automation.count + 3 message.count +
      // 1 conversation + 1 campaign = 14 DB calls, all via Promise.all.
      expect(seen).toHaveLength(14);
      expect(seen).not.toEqual(Array(14).fill(1));
    });

    it('returns zeros for platform users without an organization', async () => {
      const result = await service.summary({
        id: 'u-2',
        uuid: 'uu-2',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });

      expect(result).toEqual({
        customers: {
          total: 0,
          newThisMonth: 0,
          newInRange: 0,
          newDelta: null,
        },
        purchases: {
          total: 0,
          thisMonth: 0,
          inRange: 0,
          countDelta: null,
          value: 0,
          valueDelta: null,
        },
        automations: { scheduled: 0, executedInRange: 0, executedDelta: null },
        messages: { sent: 0, pending: 0, sentInRange: 0, sentDelta: null },
        conversations: { open: 0 },
        campaigns: { active: 0 },
      });
      expect(prisma.customer.count).not.toHaveBeenCalled();
    });
  });

  describe('campaigns (US2, FR-002)', () => {
    const row = {
      uuid: 'c-1',
      name: 'Recompra verano',
      type: CampaignType.MANUAL,
      status: CampaignStatus.ACTIVE,
      startAt: new Date('2026-09-01T10:00:00.000Z'),
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    };

    it('returns recent campaigns (createdAt desc, take 10) and upcoming (ACTIVE, startAt future, asc)', async () => {
      prisma.campaign.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const result = await service.campaigns(orgUser);

      expect(result).toEqual({ recent: [row], upcoming: [] });
      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          uuid: true,
          name: true,
          type: true,
          status: true,
          startAt: true,
          createdAt: true,
        },
      });
      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          status: 'ACTIVE',
          startAt: { gt: expect.any(Date) as unknown },
        },
        orderBy: { startAt: 'asc' },
        take: 10,
        select: {
          uuid: true,
          name: true,
          type: true,
          status: true,
          startAt: true,
          createdAt: true,
        },
      });
    });

    it('returns empty panels for platform users', async () => {
      const result = await service.campaigns({
        id: 'u-2',
        uuid: 'uu-2',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });

      expect(result).toEqual({ recent: [], upcoming: [] });
      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    });
  });

  describe('activity (US3, FR-003)', () => {
    it('returns the last 20 org audit rows with a composed userName', async () => {
      prisma.audit.findMany.mockResolvedValue([
        {
          uuid: 'a-1',
          module: 'campaigns',
          action: 'campaign.activate',
          description: 'Campaña activada',
          metadata: { campaignId: 'c-1' },
          userId: 'u-1',
          user: { firstName: 'Ana', lastName: 'Pérez' },
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
        {
          uuid: 'a-2',
          module: 'customers',
          action: 'customer.create',
          description: null,
          metadata: null,
          userId: null,
          user: null,
          createdAt: new Date('2026-08-18T09:00:00.000Z'),
        },
        {
          uuid: 'a-3',
          module: 'auth',
          action: 'session.rotated',
          description: 'session rotated x -> y',
          metadata: null,
          userId: null,
          user: null,
          createdAt: new Date('2026-08-18T08:00:00.000Z'),
        },
        {
          uuid: 'a-4',
          module: 'campaigns',
          action: 'campaign.preview_segment',
          description: 'campaign segment preview campaign=abc',
          metadata: { campaignId: 'c-1' },
          userId: null,
          user: null,
          createdAt: new Date('2026-08-18T07:00:00.000Z'),
        },
      ]);

      const result = await service.activity(orgUser);

      // El feed filtra la actividad no comercial (P0-3): no muestra sesiones ni
      // previews internos.
      expect(result).toEqual([
        {
          uuid: 'a-1',
          module: 'campaigns',
          action: 'campaign.activate',
          description: 'Campaña activada',
          metadata: { campaignId: 'c-1' },
          userId: 'u-1',
          userName: 'Ana Pérez',
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
        {
          uuid: 'a-2',
          module: 'customers',
          action: 'customer.create',
          description: 'Cliente nuevo registrado',
          metadata: null,
          userId: null,
          userName: null,
          createdAt: new Date('2026-08-18T09:00:00.000Z'),
        },
      ]);
      expect(prisma.audit.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          createdAt: {
            gte: expect.any(Date) as Date,
            lte: expect.any(Date) as Date,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('humanizes executed automations with the customer name', async () => {
      prisma.audit.findMany.mockResolvedValue([
        {
          uuid: 'a-1',
          module: 'whatsapp',
          action: 'automation.executed',
          description: 'automatic execution done automation=au-1',
          metadata: { automationId: 'au-1' },
          userId: null,
          user: null,
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ]);
      prisma.automation.findMany.mockResolvedValue([
        {
          uuid: 'au-1',
          purchase: { customer: { name: 'Carlos Mendoza' } },
          campaign: { name: 'Journey Postventa 12m' },
        },
      ]);

      const result = await service.activity(orgUser);

      expect(result).toEqual([
        expect.objectContaining({
          action: 'automation.executed',
          description:
            'Mensaje de seguimiento enviado a Carlos Mendoza · Journey Postventa 12m',
        }),
      ]);
    });

    it('returns an empty feed for platform users', async () => {
      const result = await service.activity({
        id: 'u-2',
        uuid: 'uu-2',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });

      expect(result).toEqual([]);
      expect(prisma.audit.findMany).not.toHaveBeenCalled();
    });
  });

  describe('actionable (demo D3)', () => {
    it('returns upcoming automations, expiring warranties and the repurchase window', async () => {
      prisma.automation.findMany.mockResolvedValue([
        {
          uuid: 'au-1',
          scheduledDate: new Date('2026-09-01T10:00:00Z'),
          status: 'SCHEDULED',
          campaign: { name: 'Demo' },
          purchase: {
            customer: { uuid: 'cu-1', name: 'Ana' },
            product: { name: 'Batería X' },
          },
        },
      ]);
      prisma.purchase.findMany.mockResolvedValue([
        {
          id: 'pu-1',
          warrantyExpiresAt: new Date('2026-09-15T00:00:00Z'),
          value: { toNumber: () => 420000 },
          customer: { uuid: 'cu-1', name: 'Ana' },
          product: { name: 'Batería Y' },
        },
      ]);

      const result = await service.actionable({
        id: 'u-1',
        uuid: 'uu-1',
        accountType: 'ORGANIZATION',
        organizationId: 'org-1',
        role: 'ADMINISTRADOR',
      });

      expect(prisma.automation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            status: 'SCHEDULED',
            scheduledDate: { gte: expect.any(Date) as Date },
          }) as object,
        }),
      );
      expect(result.upcomingAutomations[0]).toMatchObject({
        uuid: 'au-1',
        customerName: 'Ana',
        customerUuid: 'cu-1',
        productName: 'Batería X',
        campaignName: 'Demo',
      });
      expect(result.expiringWarranties[0].customerName).toBe('Ana');
      expect(result.repurchaseWindow[0]).toMatchObject({
        customerName: 'Ana',
        customerUuid: 'cu-1',
        potentialValue: 420000,
      });
      expect(result.openQuotes).toEqual([]);
    });

    it('returns empty actionable lists for platform users', async () => {
      const result = await service.actionable({
        id: 'u-2',
        uuid: 'uu-2',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });

      expect(result).toEqual({
        upcomingAutomations: [],
        expiringWarranties: [],
        repurchaseWindow: [],
        openQuotes: [],
      });
    });
  });
});
