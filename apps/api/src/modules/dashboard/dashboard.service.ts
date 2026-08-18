import { Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';

export interface DashboardSummary {
  customers: {
    total: number;
    newThisMonth: number;
  };
  purchases: {
    total: number;
    thisMonth: number;
  };
  automations: {
    scheduled: number;
  };
  messages: {
    sent: number;
    pending: number;
  };
  conversations: {
    open: number;
  };
  campaigns: {
    active: number;
  };
}

export interface DashboardCampaignRef {
  uuid: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startAt: Date | null;
  createdAt: Date;
}

export interface DashboardCampaigns {
  recent: DashboardCampaignRef[];
  upcoming: DashboardCampaignRef[];
}

export interface DashboardActivityItem {
  uuid: string;
  module: string;
  action: string;
  description: string | null;
  metadata: unknown;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
}

const EMPTY_SUMMARY: DashboardSummary = {
  customers: { total: 0, newThisMonth: 0 },
  purchases: { total: 0, thisMonth: 0 },
  automations: { scheduled: 0 },
  messages: { sent: 0, pending: 0 },
  conversations: { open: 0 },
  campaigns: { active: 0 },
};

const EMPTY_CAMPAIGNS: DashboardCampaigns = { recent: [], upcoming: [] };

function utcMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Read-only dashboard (HG-1): org-scoped aggregate queries on existing
// tables; no writes, no events, no audit writes (FR-005).
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser): Promise<DashboardSummary> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return EMPTY_SUMMARY;
    }

    const monthStart = utcMonthStart();
    const [
      customersTotal,
      customersNew,
      purchasesTotal,
      purchasesThisMonth,
      automationsScheduled,
      messagesSent,
      messagesPending,
      conversationsOpen,
      campaignsActive,
    ] = await Promise.all([
      this.prisma.customer.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.customer.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: monthStart },
        },
      }),
      this.prisma.purchase.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.purchase.count({
        where: {
          organizationId,
          deletedAt: null,
          purchaseDate: { gte: monthStart },
        },
      }),
      this.prisma.automation.count({
        where: { organizationId, deletedAt: null, status: 'SCHEDULED' },
      }),
      this.prisma.message.count({
        where: { organizationId, deletedAt: null, status: 'SENT' },
      }),
      this.prisma.message.count({
        where: { organizationId, deletedAt: null, status: 'QUEUED' },
      }),
      this.prisma.conversation.count({
        where: { organizationId, deletedAt: null, status: 'OPEN' },
      }),
      this.prisma.campaign.count({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
    ]);

    return {
      customers: { total: customersTotal, newThisMonth: customersNew },
      purchases: { total: purchasesTotal, thisMonth: purchasesThisMonth },
      automations: { scheduled: automationsScheduled },
      messages: { sent: messagesSent, pending: messagesPending },
      conversations: { open: conversationsOpen },
      campaigns: { active: campaignsActive },
    };
  }

  async campaigns(user: AuthUser): Promise<DashboardCampaigns> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return EMPTY_CAMPAIGNS;
    }

    const [recent, upcoming] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId, deletedAt: null },
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
      }),
      this.prisma.campaign.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: 'ACTIVE',
          startAt: { gt: new Date() },
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
      }),
    ]);

    return { recent, upcoming };
  }

  async activity(user: AuthUser): Promise<DashboardActivityItem[]> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return [];
    }

    const rows = await this.prisma.audit.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map((row) => ({
      uuid: row.uuid,
      module: row.module,
      action: row.action,
      description: row.description,
      metadata: row.metadata,
      userId: row.userId,
      userName:
        row.user !== null ? `${row.user.firstName} ${row.user.lastName}` : null,
      createdAt: row.createdAt,
    }));
  }
}
