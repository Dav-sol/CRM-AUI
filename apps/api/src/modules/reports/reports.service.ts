import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { QueryReportDto } from './dto/query-report.dto';

export interface ReportRow {
  label: string;
  value: number;
  delta?: number | null;
  [key: string]: unknown;
}

export interface CustomerReport {
  summary: {
    total: number;
    newInPeriod: number;
    pendingContact: number;
    blocked: number;
  };
  rows: ReportRow[];
}

export interface PurchaseReport {
  summary: {
    total: number;
    totalValue: number;
    unitsInPeriod: number;
    valueInPeriod: number;
    avgTicket: number;
  };
  rows: ReportRow[];
}

export interface CampaignReport {
  summary: {
    total: number;
    active: number;
    finished: number;
    totalSent: number;
    totalDelivered: number;
    totalResponded: number;
    totalSales: number;
    totalRevenue: number;
  };
  rows: ReportRow[];
}

export interface AutomationReport {
  summary: {
    total: number;
    pending: number;
    executed: number;
    errors: number;
    successRate: number;
  };
  rows: ReportRow[];
}

export interface MessageReport {
  summary: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
  };
  rows: ReportRow[];
}

/**
 * Etiqueta de agrupacion de un informe.
 *
 * LAS TRES AGRUPACIONES SE CALCULAN EN UTC. La salida es texto producido por
 * `toISOString()`, asi que el recalculo de la semana tiene que hacerse tambien
 * en UTC: con getters locales (`getDate()`/`getDay()`) el dia de la semana se
 * tomaba de la ZONA DEL PROCESO y la etiqueta dependia del entorno. El
 * contenedor de la API corre en UTC y el host en `America/Bogota`, de modo que
 * la misma fila podia etiquetarse en semanas distintas segun donde se
 * ejecutase. Es el mismo patron que `campaigns.service.ts` corrigio con
 * `addDaysUtc` (RNF-07).
 *
 * La SEMANTICA NO CAMBIA: la semana empieza en domingo (`getUTCDay()` devuelve
 * 0 = domingo), igual que antes, y las agrupaciones `day` y `month` ya usaban
 * UTC. Lo unico que cambia es que el resultado ya no depende del reloj del
 * proceso.
 */
export function reportBucketLabel(
  date: Date,
  groupBy: 'day' | 'week' | 'month',
): string {
  if (groupBy === 'day') {
    return date.toISOString().slice(0, 10);
  }
  if (groupBy === 'week') {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireOrg(user: AuthUser): string {
    if (!user.organizationId) {
      throw new Error('organizationId is required');
    }
    return user.organizationId;
  }

  private buildDateRange(
    dto: QueryReportDto,
  ): { gte?: Date; lte?: Date } | undefined {
    const where: { gte?: Date; lte?: Date } = {};
    if (dto.from) where.gte = new Date(dto.from);
    if (dto.to) where.lte = new Date(dto.to);
    return Object.keys(where).length > 0 ? where : undefined;
  }

  // ---------------------------------------------------------------------------
  // Customers report
  // ---------------------------------------------------------------------------

  async customers(
    user: AuthUser,
    dto: QueryReportDto,
  ): Promise<CustomerReport> {
    const organizationId = this.requireOrg(user);
    const dateRange = this.buildDateRange(dto);
    const groupBy = dto.groupBy ?? 'month';

    const [total, newInPeriod, pendingContact, blocked, allCustomers] =
      await Promise.all([
        this.prisma.customer.count({
          where: { organizationId, deletedAt: null },
        }),
        this.prisma.customer.count({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: dateRange ?? undefined,
          },
        }),
        this.prisma.customer.count({
          where: {
            organizationId,
            deletedAt: null,
            noContactAt: null,
            phone: null,
            email: null,
          },
        }),
        this.prisma.customer.count({
          where: { organizationId, deletedAt: null, status: 'BLOCKED' },
        }),
        this.prisma.customer.findMany({
          where: {
            organizationId,
            deletedAt: null,
            createdAt: dateRange ?? undefined,
          },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    // Group by period
    const groups = new Map<string, number>();
    for (const c of allCustomers) {
      const key = reportBucketLabel(c.createdAt, groupBy);
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }

    const rows: ReportRow[] = Array.from(groups.entries()).map(
      ([label, value]) => ({ label, value }),
    );

    return {
      summary: { total, newInPeriod, pendingContact, blocked },
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Purchases report
  // ---------------------------------------------------------------------------

  async purchases(
    user: AuthUser,
    dto: QueryReportDto,
  ): Promise<PurchaseReport> {
    const organizationId = this.requireOrg(user);
    const dateRange = this.buildDateRange(dto);
    const groupBy = dto.groupBy ?? 'month';

    const [total, totalValueAgg, periodAgg, allPurchases] = await Promise.all([
      this.prisma.purchase.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.purchase.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { value: true },
      }),
      this.prisma.purchase.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          purchaseDate: dateRange ?? undefined,
        },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.purchase.findMany({
        where: {
          organizationId,
          deletedAt: null,
          purchaseDate: dateRange ?? undefined,
        },
        select: { purchaseDate: true, value: true },
        orderBy: { purchaseDate: 'asc' },
      }),
    ]);

    const totalValue = Number(totalValueAgg._sum.value ?? 0);
    const unitsInPeriod = periodAgg._count._all;
    const valueInPeriod = Number(periodAgg._sum.value ?? 0);
    const avgTicket = unitsInPeriod > 0 ? valueInPeriod / unitsInPeriod : 0;

    const groups = new Map<string, { count: number; value: number }>();
    for (const p of allPurchases) {
      const key = reportBucketLabel(p.purchaseDate, groupBy);
      const existing = groups.get(key) ?? { count: 0, value: 0 };
      existing.count += 1;
      existing.value += Number(p.value);
      groups.set(key, existing);
    }

    const rows: ReportRow[] = Array.from(groups.entries()).map(
      ([label, data]) => ({
        label,
        value: data.count,
        totalValue: data.value,
      }),
    );

    return {
      summary: { total, totalValue, unitsInPeriod, valueInPeriod, avgTicket },
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Campaigns report
  // ---------------------------------------------------------------------------

  /**
   * Reporte de campanhas.
   *
   * `_dto` se conserva por contrato con el controlador, que lo pasa siempre.
   *
   * HALLAZGO ABIERTO (no corregido aqui, requiere autorizacion): este metodo
   * es el UNICO de los cinco que NO aplica el rango `from`/`to` del
   * `QueryReportDto` (`customers`, `purchases`, `automations` y `messages` si
   * lo hacen via `buildDateRange`). El contrato publicado en
   * `specs/api/paths/reports.yaml` declara `from` y `to` como parametros de
   * `/reports/campaigns`, de modo que hoy la API acepta los filtros y devuelve
   * datos sin filtrar. Corregirlo cambia la salida del endpoint en
   * produccion, por lo que queda fuera del alcance de la repair de lint.
   */
  async campaigns(
    user: AuthUser,
    _dto: QueryReportDto,
  ): Promise<CampaignReport> {
    const organizationId = this.requireOrg(user);

    const [total, active, finished, allCampaigns] = await Promise.all([
      this.prisma.campaign.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.campaign.count({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.campaign.count({
        where: { organizationId, deletedAt: null, status: 'FINISHED' },
      }),
      this.prisma.campaign.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          uuid: true,
          name: true,
          status: true,
          type: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let totalSent = 0;
    let totalDelivered = 0;
    let totalResponded = 0;
    let totalSales = 0;
    let totalRevenue = 0;

    const rows: ReportRow[] = [];
    for (const c of allCampaigns) {
      const [delivered, responded, quoteAgg] = await Promise.all([
        this.prisma.message.count({
          where: {
            type: 'AUTOMATIC',
            direction: 'OUTBOUND',
            automation: { campaignId: c.id },
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            deletedAt: null,
          },
        }),
        this.prisma.message.count({
          where: {
            type: 'INCOMING',
            direction: 'INBOUND',
            inReplyToCampaignId: c.uuid,
            deletedAt: null,
          },
        }),
        this.prisma.quote.aggregate({
          where: { campaignId: c.uuid, deletedAt: null },
          _count: true,
          _sum: { value: true },
        }),
      ]);

      const salesCount = await this.prisma.quote.count({
        where: {
          campaignId: c.uuid,
          deletedAt: null,
          purchaseId: { not: null },
        },
      });
      const revenue = Number(quoteAgg._sum.value ?? 0);
      const sales = salesCount;

      totalSent += delivered;
      totalDelivered += delivered;
      totalResponded += responded;
      totalSales += sales;
      totalRevenue += revenue;

      rows.push({
        label: c.name,
        value: delivered,
        status: c.status,
        type: c.type,
        delivered,
        responded,
        sales,
        revenue,
      });
    }

    return {
      summary: {
        total,
        active,
        finished,
        totalSent,
        totalDelivered,
        totalResponded,
        totalSales,
        totalRevenue,
      },
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Automations report
  // ---------------------------------------------------------------------------

  async automations(
    user: AuthUser,
    dto: QueryReportDto,
  ): Promise<AutomationReport> {
    const organizationId = this.requireOrg(user);
    const dateRange = this.buildDateRange(dto);

    const dateFilter = dateRange ? { scheduledDate: dateRange } : {};

    const [total, pending, executed, errors, allAutomations] =
      await Promise.all([
        this.prisma.automation.count({
          where: { organizationId, deletedAt: null, ...dateFilter },
        }),
        this.prisma.automation.count({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ['PENDING', 'SCHEDULED'] },
            ...dateFilter,
          },
        }),
        this.prisma.automation.count({
          where: {
            organizationId,
            deletedAt: null,
            status: 'EXECUTED',
            ...dateFilter,
          },
        }),
        this.prisma.automation.count({
          where: {
            organizationId,
            deletedAt: null,
            status: 'ERROR',
            ...dateFilter,
          },
        }),
        this.prisma.automation.findMany({
          where: { organizationId, deletedAt: null, ...dateFilter },
          select: {
            status: true,
            purpose: true,
            scheduledDate: true,
            stageName: true,
          },
          orderBy: { scheduledDate: 'asc' },
        }),
      ]);

    const successRate = total > 0 ? (executed / total) * 100 : 0;

    // Group by status
    const statusGroups = new Map<string, number>();
    for (const a of allAutomations) {
      statusGroups.set(a.status, (statusGroups.get(a.status) ?? 0) + 1);
    }

    const rows: ReportRow[] = Array.from(statusGroups.entries()).map(
      ([label, value]) => ({ label, value }),
    );

    return {
      summary: { total, pending, executed, errors, successRate },
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Messages report
  // ---------------------------------------------------------------------------

  async messages(user: AuthUser, dto: QueryReportDto): Promise<MessageReport> {
    const organizationId = this.requireOrg(user);
    const dateRange = this.buildDateRange(dto);
    const groupBy = dto.groupBy ?? 'day';

    const dateFilter = dateRange ? { createdAt: dateRange } : {};

    const [total, sent, delivered, read, failed, allMessages] =
      await Promise.all([
        this.prisma.message.count({
          where: { organizationId, deletedAt: null, ...dateFilter },
        }),
        this.prisma.message.count({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            ...dateFilter,
          },
        }),
        this.prisma.message.count({
          where: {
            organizationId,
            deletedAt: null,
            status: { in: ['DELIVERED', 'READ'] },
            ...dateFilter,
          },
        }),
        this.prisma.message.count({
          where: {
            organizationId,
            deletedAt: null,
            status: 'READ',
            ...dateFilter,
          },
        }),
        this.prisma.message.count({
          where: {
            organizationId,
            deletedAt: null,
            status: 'FAILED',
            ...dateFilter,
          },
        }),
        this.prisma.message.findMany({
          where: { organizationId, deletedAt: null, ...dateFilter },
          select: { status: true, direction: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;

    // Group by period
    const groups = new Map<
      string,
      { total: number; sent: number; failed: number }
    >();
    for (const m of allMessages) {
      const key = reportBucketLabel(m.createdAt, groupBy);
      const existing = groups.get(key) ?? { total: 0, sent: 0, failed: 0 };
      existing.total += 1;
      if (['SENT', 'DELIVERED', 'READ'].includes(m.status)) existing.sent += 1;
      if (m.status === 'FAILED') existing.failed += 1;
      groups.set(key, existing);
    }

    const rows: ReportRow[] = Array.from(groups.entries()).map(
      ([label, data]) => ({
        label,
        value: data.total,
        sent: data.sent,
        failed: data.failed,
      }),
    );

    return {
      summary: { total, sent, delivered, read, failed, deliveryRate },
      rows,
    };
  }
}
