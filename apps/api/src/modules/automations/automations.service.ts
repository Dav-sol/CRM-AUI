import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AutomationStatus,
  CommercialCycleStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { AutomationPathParamsDto } from './dto/automation-path-params.dto';
import { QueryAutomationsDto } from './dto/query-automations.dto';
import { QueryCommercialCyclesDto } from './dto/query-commercial-cycles.dto';
import {
  AutomationCancelledPayload,
  AutomationEventPayload,
  CycleCancelledPayload,
  CycleEventPayload,
  buildAutomationEvent,
} from './automations.events';

const MODULE = 'automations';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CYCLE_SORT_FIELDS = new Set(['createdAt', 'startDate', 'updatedAt']);
const AUTOMATION_SORT_FIELDS = new Set([
  'scheduledDate',
  'createdAt',
  'updatedAt',
  'status',
]);

const CANCELLABLE_STATUSES: AutomationStatus[] = ['PENDING', 'SCHEDULED'];

interface PurchaseImportedEnvelope {
  payload: {
    purchaseId: string;
    invoiceNumber?: string;
    importId?: string;
  };
}

export interface CommercialCycleSummary {
  uuid: string;
  status: CommercialCycleStatus;
  startDate: Date;
  endDate: Date | null;
  purchaseId: string;
  createdAt: Date;
}

export interface CommercialCycleDetail extends CommercialCycleSummary {
  automations: AutomationSummary[];
}

export interface AutomationSummary {
  uuid: string;
  status: AutomationStatus;
  scheduledDate: Date;
  executedDate: Date | null;
  priority: number;
  purchaseId: string;
  commercialCycleId: string;
  createdAt: Date;
}

export interface AutomationDetail extends AutomationSummary {
  organizationId: string;
  campaignId: string | null;
  purchase: {
    uuid: string;
    invoiceNumber: string;
    purchaseDate: Date;
    productName: string;
  };
  customer: {
    uuid: string;
    name: string;
    phone: string | null;
  };
}

export interface ListResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

const AUTOMATION_INCLUDE = {
  purchase: {
    select: {
      uuid: true,
      invoiceNumber: true,
      purchaseDate: true,
      product: { select: { name: true } },
      customer: { select: { uuid: true, name: true, phone: true } },
    },
  },
  commercialCycle: { select: { uuid: true } },
} as const;

const AUTOMATION_INCLUDE_SUMMARY = {
  purchase: { select: { uuid: true } },
  commercialCycle: { select: { uuid: true } },
} as const;

const CYCLE_INCLUDE_SUMMARY = {
  purchase: { select: { uuid: true } },
} as const;

const CYCLE_INCLUDE_DETAIL = {
  purchase: { select: { uuid: true } },
  automations: {
    where: { deletedAt: null },
    include: AUTOMATION_INCLUDE_SUMMARY,
  },
} as const;

type AutomationWithRelations = Prisma.AutomationGetPayload<{
  include: typeof AUTOMATION_INCLUDE;
}>;

type AutomationSummaryRow = Prisma.AutomationGetPayload<{
  include: typeof AUTOMATION_INCLUDE_SUMMARY;
}>;

type CycleSummaryRow = Prisma.CommercialCycleGetPayload<{
  include: typeof CYCLE_INCLUDE_SUMMARY;
}>;

type CycleDetailRow = Prisma.CommercialCycleGetPayload<{
  include: typeof CYCLE_INCLUDE_DETAIL;
}>;

type CancelledAutomationRow = {
  uuid: string;
  purchaseId: string;
  commercialCycleId: string | null;
  scheduledDate: Date;
  status: AutomationStatus;
};

function toCycleSummary(cycle: CycleSummaryRow): CommercialCycleSummary {
  return {
    uuid: cycle.uuid,
    status: cycle.status,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    purchaseId: cycle.purchase?.uuid ?? cycle.purchaseId,
    createdAt: cycle.createdAt,
  };
}

function toAutomationSummary(
  automation: AutomationSummaryRow,
): AutomationSummary {
  return {
    uuid: automation.uuid,
    status: automation.status,
    scheduledDate: automation.scheduledDate,
    executedDate: automation.executedDate,
    priority: automation.priority,
    purchaseId: automation.purchase?.uuid ?? automation.purchaseId,
    commercialCycleId:
      automation.commercialCycle?.uuid ?? automation.commercialCycleId ?? '',
    createdAt: automation.createdAt,
  };
}

function toAutomationDetail(
  automation: AutomationWithRelations,
): AutomationDetail {
  return {
    ...toAutomationSummary(automation),
    organizationId: automation.organizationId,
    campaignId: automation.campaignId,
    purchase: {
      uuid: automation.purchase?.uuid ?? automation.purchaseId,
      invoiceNumber: automation.purchase?.invoiceNumber ?? '',
      purchaseDate:
        automation.purchase?.purchaseDate ?? automation.scheduledDate,
      productName: automation.purchase?.product?.name ?? '',
    },
    customer: {
      uuid: automation.purchase?.customer?.uuid ?? '',
      name: automation.purchase?.customer?.name ?? '',
      phone: automation.purchase?.customer?.phone ?? null,
    },
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (day > lastDay) {
    result.setUTCDate(lastDay);
  }
  return result;
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('PurchaseImported')
  async onPurchaseImported(event: PurchaseImportedEnvelope): Promise<void> {
    const purchaseId = event.payload.purchaseId;
    try {
      await this.createCycleFromPurchase(purchaseId);
    } catch (error) {
      this.logger.error(
        `automation cycle creation failed for purchase ${purchaseId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async createCycleFromPurchase(purchaseId: string): Promise<void> {
    const existing = await this.prisma.commercialCycle.findUnique({
      where: { purchaseId },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { customer: { select: { id: true } } },
    });
    if (!purchase) {
      return;
    }

    const activeCycle = await this.prisma.commercialCycle.findFirst({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        purchase: {
          customerId: purchase.customerId,
          organizationId: purchase.organizationId,
          deletedAt: null,
        },
      },
      select: { id: true },
    });

    try {
      const { cycle, automations, cancelledAutomations, cancelledCycleId } =
        await this.prisma.$transaction(async (tx) => {
          let cancelledAutomations: CancelledAutomationRow[] = [];
          if (activeCycle) {
            cancelledAutomations = await tx.automation.findMany({
              where: {
                commercialCycleId: activeCycle.id,
                status: { in: CANCELLABLE_STATUSES },
                deletedAt: null,
              },
              select: {
                uuid: true,
                purchaseId: true,
                commercialCycleId: true,
                scheduledDate: true,
                status: true,
              },
            });
            await tx.automation.updateMany({
              where: {
                commercialCycleId: activeCycle.id,
                status: { in: CANCELLABLE_STATUSES },
                deletedAt: null,
              },
              data: { status: 'CANCELLED', updatedBy: null },
            });
            await tx.commercialCycle.update({
              where: { id: activeCycle.id },
              data: {
                status: 'CANCELLED',
                endDate: new Date(),
                updatedBy: null,
              },
            });
          }

          const created = await tx.commercialCycle.create({
            data: {
              purchaseId,
              status: 'ACTIVE',
              startDate: purchase.purchaseDate,
            },
          });

          const scheduledDates = [
            addDays(purchase.purchaseDate, 3),
            addMonths(purchase.purchaseDate, 6),
            addMonths(purchase.purchaseDate, 12),
          ];

          const automationRows = await Promise.all(
            scheduledDates.map((scheduledDate) =>
              tx.automation.create({
                data: {
                  organizationId: purchase.organizationId,
                  purchaseId,
                  commercialCycleId: created.id,
                  scheduledDate,
                  status: 'SCHEDULED',
                  priority: 0,
                },
              }),
            ),
          );

          return {
            cycle: created,
            automations: automationRows,
            cancelledAutomations,
            cancelledCycleId: activeCycle?.id ?? null,
          };
        });

      await this.auditService.record({
        module: MODULE,
        action: 'automation.cycle.created',
        outcome: 'success',
        userId: null,
        organizationId: purchase.organizationId,
        description: `commercial cycle created purchase=${purchase.uuid}`,
        metadata: {
          cycleId: cycle.uuid,
          purchaseId: purchase.uuid,
          automationCount: automations.length,
        },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'automation.created',
        outcome: 'success',
        userId: null,
        organizationId: purchase.organizationId,
        description: `automations created cycle=${cycle.uuid}`,
        metadata: {
          cycleId: cycle.uuid,
          automationIds: automations.map((automation) => automation.uuid),
        },
      });

      if (cancelledCycleId) {
        const cancelled = await this.prisma.commercialCycle.findUnique({
          where: { id: cancelledCycleId },
          select: { uuid: true },
        });
        await this.auditService.record({
          module: MODULE,
          action: 'automation.cycle.cancelled',
          outcome: 'success',
          userId: null,
          organizationId: purchase.organizationId,
          description: `commercial cycle cancelled purchase=${purchase.uuid}`,
          metadata: { cycleId: cancelled?.uuid ?? cancelledCycleId },
        });
      }

      this.emit('CommercialCycleStarted', null, purchase.organizationId, {
        cycleId: cycle.uuid,
        purchaseId: purchase.uuid,
        status: cycle.status,
        startDate: cycle.startDate.toISOString(),
      } satisfies CycleEventPayload);
      for (const automation of automations) {
        this.emit('AutomationCreated', null, purchase.organizationId, {
          automationId: automation.uuid,
          purchaseId: purchase.uuid,
          commercialCycleId: cycle.uuid,
          status: automation.status,
          scheduledDate: automation.scheduledDate.toISOString(),
        } satisfies AutomationEventPayload);
      }
      for (const automation of cancelledAutomations) {
        this.emit('AutomationCancelled', null, purchase.organizationId, {
          automationId: automation.uuid,
          purchaseId: automation.purchaseId,
          commercialCycleId:
            automation.commercialCycleId ?? cancelledCycleId ?? '',
          status: automation.status,
          scheduledDate: automation.scheduledDate.toISOString(),
          cancelledAt: new Date().toISOString(),
        } satisfies AutomationCancelledPayload);
      }
      if (cancelledCycleId) {
        const cancelledCycle = await this.prisma.commercialCycle.findUnique({
          where: { id: cancelledCycleId },
          select: { uuid: true, endDate: true },
        });
        if (cancelledCycle) {
          this.emit('CommercialCycleCancelled', null, purchase.organizationId, {
            cycleId: cancelledCycle.uuid,
            purchaseId: purchase.uuid,
            status: 'CANCELLED',
            startDate: cycle.startDate.toISOString(),
            endDate:
              cancelledCycle.endDate?.toISOString() ?? new Date().toISOString(),
          } satisfies CycleCancelledPayload);
        }
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  async listCycles(
    user: AuthUser,
    query: QueryCommercialCyclesDto,
  ): Promise<ListResult<CommercialCycleSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildCycleListWhere(user, query);

    const [total, cycles] = await Promise.all([
      this.prisma.commercialCycle.count({ where }),
      this.prisma.commercialCycle.findMany({
        where,
        include: CYCLE_INCLUDE_SUMMARY,
        orderBy: this.buildSort(query.sort, CYCLE_SORT_FIELDS, '-createdAt'),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: cycles.map(toCycleSummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getCycle(
    user: AuthUser,
    uuid: string,
  ): Promise<CommercialCycleDetail | null> {
    const cycle = await this.findScopedCycle(user, uuid);
    if (!cycle) {
      return null;
    }
    return {
      ...toCycleSummary(cycle),
      automations: (cycle.automations ?? []).map(toAutomationSummary),
    };
  }

  async listAutomations(
    user: AuthUser,
    query: QueryAutomationsDto,
  ): Promise<ListResult<AutomationSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildAutomationListWhere(user, query);

    const [total, automations] = await Promise.all([
      this.prisma.automation.count({ where }),
      this.prisma.automation.findMany({
        where,
        include: AUTOMATION_INCLUDE_SUMMARY,
        orderBy: this.buildSort(
          query.sort,
          AUTOMATION_SORT_FIELDS,
          '-scheduledDate',
        ),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: automations.map(toAutomationSummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getAutomation(
    user: AuthUser,
    uuid: string,
  ): Promise<AutomationDetail | null> {
    const automation = await this.findScopedAutomation(user, uuid);
    return automation ? toAutomationDetail(automation) : null;
  }

  async cancelAutomation(
    user: AuthUser,
    params: AutomationPathParamsDto,
  ): Promise<AutomationDetail> {
    const automation = await this.findScopedAutomation(user, params.uuid);
    if (!automation) {
      await this.auditService.record({
        module: MODULE,
        action: 'automation.cancelled',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: {
          code: 'AUTOMATION_NOT_FOUND',
          message: 'Automation not found',
        },
      });
    }

    if (!CANCELLABLE_STATUSES.includes(automation.status)) {
      await this.auditService.record({
        module: MODULE,
        action: 'automation.cancelled',
        outcome: 'failure',
        userId: user.id,
        organizationId: automation.organizationId,
        metadata: { reason: 'invalid_state', status: automation.status },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Cannot cancel an automation in status ${automation.status}`,
        },
      });
    }

    const updated = await this.prisma.automation.update({
      where: { id: automation.id },
      data: { status: 'CANCELLED', updatedBy: user.id },
      include: AUTOMATION_INCLUDE,
    });

    await this.auditService.record({
      module: MODULE,
      action: 'automation.cancelled',
      outcome: 'success',
      userId: user.id,
      organizationId: updated.organizationId,
      description: `automation cancelled uuid=${updated.uuid}`,
      metadata: {
        cycleId: updated.commercialCycleId,
        scheduledDate: updated.scheduledDate.toISOString(),
      },
    });

    this.emit('AutomationCancelled', user.id, updated.organizationId, {
      automationId: updated.uuid,
      purchaseId: updated.purchase?.uuid ?? updated.purchaseId,
      commercialCycleId:
        updated.commercialCycle?.uuid ?? updated.commercialCycleId ?? '',
      status: updated.status,
      scheduledDate: updated.scheduledDate.toISOString(),
      cancelledAt: new Date().toISOString(),
    } satisfies AutomationCancelledPayload);

    return toAutomationDetail(updated);
  }

  private emit<T>(
    event: string,
    userId: string | null,
    organizationId: string,
    payload: T,
  ): void {
    this.eventEmitter.emit(
      event,
      buildAutomationEvent<T>(
        event.endsWith('Started')
          ? 'STARTED'
          : event.endsWith('Created')
            ? 'CREATED'
            : 'CANCELLED',
        userId,
        organizationId,
        payload,
      ),
    );
  }

  private findScopedCycle(
    user: AuthUser,
    uuid: string,
  ): Promise<CycleDetailRow | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.commercialCycle.findFirst({
        where: {
          uuid,
          deletedAt: null,
          purchase: { organizationId: user.organizationId ?? undefined },
        },
        include: CYCLE_INCLUDE_DETAIL,
      });
    }
    return this.prisma.commercialCycle.findFirst({
      where: { uuid, deletedAt: null },
      include: CYCLE_INCLUDE_DETAIL,
    });
  }

  private findScopedAutomation(
    user: AuthUser,
    uuid: string,
  ): Promise<AutomationWithRelations | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.automation.findFirst({
        where: {
          uuid,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
        include: AUTOMATION_INCLUDE,
      });
    }
    return this.prisma.automation.findFirst({
      where: { uuid, deletedAt: null },
      include: AUTOMATION_INCLUDE,
    });
  }

  private buildCycleListWhere(
    user: AuthUser,
    query: QueryCommercialCyclesDto,
  ): Prisma.CommercialCycleWhereInput {
    const where: Prisma.CommercialCycleWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.purchase = { organizationId: user.organizationId ?? undefined };
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.purchase = {
        ...(where.purchase as Prisma.PurchaseWhereInput),
        customer: { uuid: query.customerId },
      };
    }
    if (query.purchaseId) {
      where.purchase = {
        ...(where.purchase as Prisma.PurchaseWhereInput),
        uuid: query.purchaseId,
      };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = this.resolveDateBoundary(
          query.createdFrom,
          false,
        );
      }
      if (query.createdTo) {
        where.createdAt.lte = this.resolveDateBoundary(query.createdTo, true);
      }
    }
    return where;
  }

  private buildAutomationListWhere(
    user: AuthUser,
    query: QueryAutomationsDto,
  ): Prisma.AutomationWhereInput {
    const where: Prisma.AutomationWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.commercialCycleId) {
      where.commercialCycle = { uuid: query.commercialCycleId };
    }
    if (query.campaignId) {
      where.campaign = { uuid: query.campaignId };
    }
    if (query.customerId) {
      where.purchase = { customer: { uuid: query.customerId } };
    }
    if (query.scheduledFrom || query.scheduledTo) {
      where.scheduledDate = {};
      if (query.scheduledFrom) {
        where.scheduledDate.gte = this.resolveDateBoundary(
          query.scheduledFrom,
          false,
        );
      }
      if (query.scheduledTo) {
        where.scheduledDate.lte = this.resolveDateBoundary(
          query.scheduledTo,
          true,
        );
      }
    }
    return where;
  }

  private resolveDateBoundary(value: string, upper: boolean): Date {
    if (DATE_ONLY_PATTERN.test(value)) {
      return upper
        ? new Date(`${value}T23:59:59.999Z`)
        : new Date(`${value}T00:00:00.000Z`);
    }
    return new Date(value);
  }

  private buildSort(
    sort: string | undefined,
    allowed: Set<string>,
    fallback: string,
  ): Record<string, 'asc' | 'desc'> {
    const field = (sort ?? fallback).replace(/^-/, '');
    if (!allowed.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? fallback).startsWith('-') ? 'desc' : 'asc';
    return { [field]: direction };
  }
}
