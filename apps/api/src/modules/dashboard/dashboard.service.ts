import { Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignType, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { QueryDashboardRangeDto } from './dto/query-dashboard-range.dto';

export interface DashboardSummary {
  customers: {
    total: number;
    newThisMonth: number;
    // Google Ads style: KPI inside the selected range + delta vs previous period.
    newInRange: number;
    newDelta: number | null;
  };
  purchases: {
    total: number;
    thisMonth: number;
    inRange: number;
    countDelta: number | null;
    // Sum of purchase.value in range (revenue proxy; no cost layer in v1).
    value: number;
    valueDelta: number | null;
  };
  automations: {
    scheduled: number;
    executedInRange: number;
    executedDelta: number | null;
  };
  messages: {
    sent: number;
    pending: number;
    sentInRange: number;
    sentDelta: number | null;
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

export interface DashboardUpcomingAutomation {
  uuid: string;
  scheduledDate: Date;
  status: string;
  customerName: string;
  customerUuid: string;
  productName: string;
  campaignName: string | null;
}

export interface DashboardExpiringWarranty {
  purchaseId: string;
  customerName: string;
  customerUuid: string;
  productName: string;
  warrantyExpiresAt: Date;
}

export interface DashboardRepurchaseOpportunity {
  purchaseId: string;
  customerName: string;
  customerUuid: string;
  productName: string;
  warrantyExpiresAt: Date;
  // Valor de la última compra (potencial de recompra).
  potentialValue: number;
}

export interface DashboardOpenQuote {
  uuid: string;
  customerName: string;
  value: number;
  sentAt: Date | null;
  createdAt: Date;
}

export interface DashboardActionable {
  upcomingAutomations: DashboardUpcomingAutomation[];
  expiringWarranties: DashboardExpiringWarranty[];
  repurchaseWindow: DashboardRepurchaseOpportunity[];
  openQuotes: DashboardOpenQuote[];
}

const EMPTY_ACTIONABLE: DashboardActionable = {
  upcomingAutomations: [],
  expiringWarranties: [],
  repurchaseWindow: [],
  openQuotes: [],
};

const EMPTY_SUMMARY: DashboardSummary = {
  customers: { total: 0, newThisMonth: 0, newInRange: 0, newDelta: null },
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
};

const EMPTY_CAMPAIGNS: DashboardCampaigns = { recent: [], upcoming: [] };

function utcMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function boundary(value: string, upper: boolean): Date {
  if (DATE_ONLY_PATTERN.test(value)) {
    return upper
      ? new Date(`${value}T23:59:59.999Z`)
      : new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

interface ResolvedRange {
  from: Date;
  to: Date;
  compareFrom: Date | null;
  compareTo: Date | null;
}

function resolveRange(query: QueryDashboardRangeDto): ResolvedRange {
  const now = new Date();
  if (query.from || query.to) {
    return {
      from: query.from ? boundary(query.from, false) : new Date(0),
      to: query.to ? boundary(query.to, true) : now,
      compareFrom: query.compareFrom
        ? boundary(query.compareFrom, false)
        : null,
      compareTo: query.compareTo ? boundary(query.compareTo, true) : null,
    };
  }
  // Default: current UTC month (backwards-compatible with "this month").
  const monthStart = utcMonthStart();
  return {
    from: monthStart,
    to: now,
    compareFrom: null,
    compareTo: null,
  };
}

function delta(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// Whitelist de actividad comercial para el feed (P0-3): solo acciones que un
// operador entiende. Todo lo demás (sessions, previews, ciclos internos,
// imports internos) queda fuera del feed (el audit trail completo se conserva).
const ACTIVITY_LABELS: Record<string, string> = {
  'purchase.create': 'Compra registrada',
  'purchase.update': 'Compra actualizada',
  'customer.create': 'Cliente nuevo registrado',
  'customer.update': 'Cliente actualizado',
  'campaign.create': 'Campaña creada',
  'campaign.update': 'Campaña actualizada',
  'campaign.approved': 'Campaña aprobada',
  'campaign.activate': 'Campaña activada',
  'campaign.pause': 'Campaña pausada',
  'campaign.resume': 'Campaña reanudada',
  'campaign.cancel': 'Campaña cancelada',
  'campaign.finish': 'Campaña finalizada',
  'automation.failed': 'Fallo al enviar un mensaje de seguimiento',
  'automation.cancelled': 'Mensaje de seguimiento cancelado',
  'message.send': 'Mensaje enviado al cliente',
  'message.received': 'Mensaje recibido del cliente',
  reply_inbox: 'Respuesta enviada al cliente',
  'conversation.assign': 'Conversación asignada',
  'conversation.transfer': 'Conversación transferida',
  'conversation.close': 'Conversación cerrada',
  'conversation.reopen': 'Conversación reabierta',
  'conversation.archive': 'Conversación archivada',
  'conversation.opened': 'Conversación abierta',
  'conversation.note.create': 'Nota interna agregada',
  'import.create': 'Importación registrada',
  'import.complete': 'Importación completada',
};

// Read-only dashboard (HG-1): org-scoped aggregate queries on existing
// tables; no writes, no events, no audit writes (FR-005).
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    user: AuthUser,
    rangeQuery: QueryDashboardRangeDto = {},
  ): Promise<DashboardSummary> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return EMPTY_SUMMARY;
    }

    const monthStart = utcMonthStart();
    const range = resolveRange(rangeQuery);
    const purchaseDateFilter = (
      from: Date,
      to: Date,
    ): Prisma.PurchaseWhereInput => ({
      organizationId,
      deletedAt: null,
      purchaseDate: { gte: from, lte: to },
    });

    const comparePurchaseFilter: Prisma.PurchaseWhereInput | null =
      range.compareFrom && range.compareTo
        ? purchaseDateFilter(range.compareFrom, range.compareTo)
        : null;

    const [
      customersTotal,
      customersNew,
      customersNewInRange,
      customersNewPrev,
      purchasesTotal,
      purchasesThisMonth,
      purchasesInRange,
      purchasesPrev,
      purchaseAgg,
      purchaseAggPrev,
      automationsScheduled,
      automationsExecutedInRange,
      automationsExecutedPrev,
      messagesSent,
      messagesPending,
      messagesSentInRange,
      messagesSentPrev,
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
      this.prisma.customer.count({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      range.compareFrom && range.compareTo
        ? this.prisma.customer.count({
            where: {
              organizationId,
              deletedAt: null,
              createdAt: { gte: range.compareFrom, lte: range.compareTo },
            },
          })
        : Promise.resolve(0),
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
      this.prisma.purchase.count({
        where: purchaseDateFilter(range.from, range.to),
      }),
      comparePurchaseFilter
        ? this.prisma.purchase.count({ where: comparePurchaseFilter })
        : Promise.resolve(0),
      this.prisma.purchase.aggregate({
        where: purchaseDateFilter(range.from, range.to),
        _sum: { value: true },
      }),
      comparePurchaseFilter
        ? this.prisma.purchase.aggregate({
            where: comparePurchaseFilter,
            _sum: { value: true },
          })
        : Promise.resolve({ _sum: { value: null } }),
      this.prisma.automation.count({
        where: { organizationId, deletedAt: null, status: 'SCHEDULED' },
      }),
      this.prisma.automation.count({
        where: {
          organizationId,
          deletedAt: null,
          status: 'EXECUTED',
          executedDate: { gte: range.from, lte: range.to },
        },
      }),
      range.compareFrom && range.compareTo
        ? this.prisma.automation.count({
            where: {
              organizationId,
              deletedAt: null,
              status: 'EXECUTED',
              executedDate: {
                gte: range.compareFrom,
                lte: range.compareTo,
              },
            },
          })
        : Promise.resolve(0),
      this.prisma.message.count({
        where: { organizationId, deletedAt: null, status: 'SENT' },
      }),
      this.prisma.message.count({
        where: { organizationId, deletedAt: null, status: 'QUEUED' },
      }),
      this.prisma.message.count({
        where: {
          organizationId,
          deletedAt: null,
          status: 'SENT',
          sentAt: { gte: range.from, lte: range.to },
        },
      }),
      range.compareFrom && range.compareTo
        ? this.prisma.message.count({
            where: {
              organizationId,
              deletedAt: null,
              status: 'SENT',
              sentAt: { gte: range.compareFrom, lte: range.compareTo },
            },
          })
        : Promise.resolve(0),
      this.prisma.conversation.count({
        where: { organizationId, deletedAt: null, status: 'OPEN' },
      }),
      this.prisma.campaign.count({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
    ]);

    const purchaseValue = purchaseAgg._sum.value?.toNumber() ?? 0;
    const purchaseValuePrev = purchaseAggPrev._sum.value?.toNumber() ?? 0;

    return {
      customers: {
        total: customersTotal,
        newThisMonth: customersNew,
        newInRange: customersNewInRange,
        newDelta: delta(customersNewInRange, customersNewPrev),
      },
      purchases: {
        total: purchasesTotal,
        thisMonth: purchasesThisMonth,
        inRange: purchasesInRange,
        countDelta: delta(purchasesInRange, purchasesPrev),
        value: purchaseValue,
        valueDelta: delta(purchaseValue, purchaseValuePrev),
      },
      automations: {
        scheduled: automationsScheduled,
        executedInRange: automationsExecutedInRange,
        executedDelta: delta(
          automationsExecutedInRange,
          automationsExecutedPrev,
        ),
      },
      messages: {
        sent: messagesSent,
        pending: messagesPending,
        sentInRange: messagesSentInRange,
        sentDelta: delta(messagesSentInRange, messagesSentPrev),
      },
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
          // spec 020 FR-002/Q3 (HG-3): upcoming = ACTIVE with future startAt
          // only. APPROVED campaigns are not scheduled yet.
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

  // "Qué hacer hoy" (demo D3): real, org-scoped, decision-support lists.
  async actionable(user: AuthUser): Promise<DashboardActionable> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return EMPTY_ACTIONABLE;
    }
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);
    const in12Months = new Date(now.getTime() - 12 * 30 * 86_400_000);

    const [upcomingAutomations, expiringWarranties, repurchaseWindow, openQuotesRows] =
      await Promise.all([
        this.prisma.automation.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: 'SCHEDULED',
            scheduledDate: { gte: now },
            purchase: { deletedAt: null },
          },
          orderBy: { scheduledDate: 'asc' },
          take: 5,
          select: {
            uuid: true,
            scheduledDate: true,
            status: true,
            campaign: { select: { name: true } },
            purchase: {
              select: {
                customer: { select: { uuid: true, name: true } },
                product: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.purchase.findMany({
          where: {
            organizationId,
            deletedAt: null,
            warrantyExpiresAt: { gte: now, lte: in30Days },
          },
          orderBy: { warrantyExpiresAt: 'asc' },
          take: 5,
          select: {
            id: true,
            warrantyExpiresAt: true,
            customer: { select: { uuid: true, name: true } },
            product: { select: { name: true } },
          },
        }),
        this.prisma.purchase.findMany({
          where: {
            organizationId,
            deletedAt: null,
            warrantyExpiresAt: { gte: in12Months, lte: now },
          },
          orderBy: { warrantyExpiresAt: 'desc' },
          take: 5,
          select: {
            id: true,
            warrantyExpiresAt: true,
            value: true,
            customer: { select: { uuid: true, name: true } },
            product: { select: { name: true } },
          },
        }),
        this.prisma.quote.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ['ENVIADA', 'DRAFT'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            uuid: true,
            value: true,
            sentAt: true,
            createdAt: true,
            customerId: true,
          },
        }),
      ]);

    const quoteCustomerIds = [
      ...new Set(
        openQuotesRows.map((quote) => quote.customerId).filter(Boolean),
      ),
    ] as string[];
    const quoteCustomers = quoteCustomerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: quoteCustomerIds } },
          select: { id: true, name: true },
        })
      : [];
    const quoteName = new Map(
      quoteCustomers.map((customer) => [customer.id, customer.name]),
    );

    return {
      upcomingAutomations: upcomingAutomations.map((automation) => ({
        uuid: automation.uuid,
        scheduledDate: automation.scheduledDate,
        status: automation.status,
        customerName: automation.purchase?.customer?.name ?? 'Cliente',
        customerUuid: automation.purchase?.customer?.uuid ?? '',
        productName: automation.purchase?.product?.name ?? '',
        campaignName: automation.campaign?.name ?? null,
      })),
      expiringWarranties: expiringWarranties.map((purchase) => ({
        purchaseId: purchase.id,
        customerName: purchase.customer?.name ?? 'Cliente',
        customerUuid: purchase.customer?.uuid ?? '',
        productName: purchase.product?.name ?? '',
        warrantyExpiresAt: purchase.warrantyExpiresAt as Date,
      })),
      repurchaseWindow: repurchaseWindow.map((purchase) => ({
        purchaseId: purchase.id,
        customerName: purchase.customer?.name ?? 'Cliente',
        customerUuid: purchase.customer?.uuid ?? '',
        productName: purchase.product?.name ?? '',
        warrantyExpiresAt: purchase.warrantyExpiresAt as Date,
        potentialValue: purchase.value.toNumber(),
      })),
      openQuotes: openQuotesRows.map((quote) => ({
        uuid: quote.uuid,
        customerName: quote.customerId
          ? (quoteName.get(quote.customerId) ?? 'Cliente')
          : 'Cliente',
        value: quote.value.toNumber(),
        sentAt: quote.sentAt,
        createdAt: quote.createdAt,
      })),
    };
  }

  async activity(
    user: AuthUser,
    rangeQuery: QueryDashboardRangeDto = {},
  ): Promise<DashboardActivityItem[]> {
    const organizationId = user.organizationId;
    if (!organizationId) {
      return [];
    }

    const range = resolveRange(rangeQuery);
    const rows = await this.prisma.audit.findMany({
      where: {
        organizationId,
        createdAt: { gte: range.from, lte: range.to },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    // Whitelist: only business actions reach the feed. Technical/internal
    // events (sessions, previews, cycle internals, imports plumbing) are
    // excluded so the operator never sees IDs or infra noise (P0-3).
    const executedUuids = rows
      .filter((row) => row.action === 'automation.executed')
      .map((row) => {
        const id = row.metadata as { automationId?: string } | null;
        return id?.automationId;
      })
      .filter((uuid): uuid is string => Boolean(uuid));

    const automations = executedUuids.length
      ? await this.prisma.automation.findMany({
          where: { uuid: { in: executedUuids } },
          select: {
            uuid: true,
            purchase: { select: { customer: { select: { name: true } } } },
            campaign: { select: { name: true } },
          },
        })
      : [];
    const automationByUuid = new Map(
      automations.map((automation) => [automation.uuid, automation]),
    );

    const items: DashboardActivityItem[] = [];
    for (const row of rows) {
      if (row.action === 'automation.executed') {
        const automation = row.metadata as { automationId?: string } | null;
        const found = automation?.automationId
          ? automationByUuid.get(automation.automationId)
          : null;
        const customerName = found?.purchase?.customer?.name;
        const campaignName = found?.campaign?.name;
        items.push({
          uuid: row.uuid,
          module: row.module,
          action: row.action,
          description: customerName
            ? `Mensaje de seguimiento enviado a ${customerName}${
                campaignName ? ` · ${campaignName}` : ''
              }`
            : 'Mensaje de seguimiento enviado',
          metadata: row.metadata,
          userId: row.userId,
          userName:
            row.user !== null
              ? `${row.user.firstName} ${row.user.lastName}`
              : null,
          createdAt: row.createdAt,
        });
        continue;
      }
      const label = ACTIVITY_LABELS[row.action];
      if (!label) {
        continue;
      }
      items.push({
        uuid: row.uuid,
        module: row.module,
        action: row.action,
        description: label,
        metadata: row.metadata,
        userId: row.userId,
        userName:
          row.user !== null
            ? `${row.user.firstName} ${row.user.lastName}`
            : null,
        createdAt: row.createdAt,
      });
      if (items.length >= 20) {
        break;
      }
    }

    return items.slice(0, 20);
  }
}
