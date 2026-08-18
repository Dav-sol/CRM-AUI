import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    customer: { count: jest.Mock };
    purchase: { count: jest.Mock };
    automation: { count: jest.Mock };
    message: { count: jest.Mock };
    conversation: { count: jest.Mock };
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
      customer: { count: jest.fn().mockResolvedValue(0) },
      purchase: { count: jest.fn().mockResolvedValue(0) },
      automation: { count: jest.fn().mockResolvedValue(0) },
      message: { count: jest.fn().mockResolvedValue(0) },
      conversation: { count: jest.fn().mockResolvedValue(0) },
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
    it('computes all nine KPIs from org-scoped counts', async () => {
      prisma.customer.count.mockResolvedValueOnce(128).mockResolvedValueOnce(9);
      prisma.purchase.count
        .mockResolvedValueOnce(342)
        .mockResolvedValueOnce(41);
      prisma.automation.count.mockResolvedValue(27);
      prisma.message.count.mockResolvedValueOnce(96).mockResolvedValueOnce(4);
      prisma.conversation.count.mockResolvedValue(6);
      prisma.campaign.count.mockResolvedValue(2);

      const result = await service.summary(orgUser);

      expect(result).toEqual({
        customers: { total: 128, newThisMonth: 9 },
        purchases: { total: 342, thisMonth: 41 },
        automations: { scheduled: 27 },
        messages: { sent: 96, pending: 4 },
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
      const now = new Date();
      const expected = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      await service.summary(orgUser);

      expect(prisma.customer.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: { gte: expected },
        },
      });
    });

    it('uses purchaseDate (not createdAt) for thisMonth purchases', async () => {
      const now = new Date();
      const expected = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      await service.summary(orgUser);

      expect(prisma.purchase.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: { gte: expected },
        },
      });
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

      expect(seen).toHaveLength(9);
      expect(seen).not.toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
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
        customers: { total: 0, newThisMonth: 0 },
        purchases: { total: 0, thisMonth: 0 },
        automations: { scheduled: 0 },
        messages: { sent: 0, pending: 0 },
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
      ]);

      const result = await service.activity(orgUser);

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
          description: null,
          metadata: null,
          userId: null,
          userName: null,
          createdAt: new Date('2026-08-18T09:00:00.000Z'),
        },
      ]);
      expect(prisma.audit.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      });
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
});
