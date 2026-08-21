import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { CampaignSegmentDto } from './dto/campaign-segment.dto';
import { PreviewSegmentDto } from './dto/preview-segment.dto';
import {
  CAMPAIGN_BATCH_SIZE,
  MAX_AUTOMATIONS_PER_CAMPAIGN,
} from './campaigns.constants';
import {
  CampaignEventEnvelope,
  buildCampaignActivatedEvent,
  buildCampaignCancelledEvent,
  buildCampaignCreatedEvent,
  buildCampaignFinishedEvent,
  buildCampaignUpdatedEvent,
} from './campaigns.events';

const MODULE = 'campaigns';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'status',
  'type',
  'startAt',
]);

interface AutomationExecutedEnvelope {
  payload: {
    automationId: string;
  };
}

interface CampaignStats {
  automationCount: number;
  executedCount: number;
}

export interface CampaignSummary {
  uuid: string;
  name: string;
  description: string | null;
  type: CampaignType;
  status: CampaignStatus;
  startAt: Date | null;
  segment: Prisma.JsonValue | null;
  automationCount: number;
  executedCount: number;
  createdAt: Date;
}

export interface CampaignDetail extends CampaignSummary {
  template: string;
  updatedAt: Date;
}

export interface CampaignListResult {
  data: CampaignSummary[];
  meta: { page: number; limit: number; total: number; pages: number };
}

interface CampaignRow {
  id: string;
  uuid: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: CampaignType;
  template: string;
  status: CampaignStatus;
  startAt: Date | null;
  segment: Prisma.JsonValue | null;
  followUpSequence?: {
    uuid: string;
    warrantyMonths: number;
    stages: Array<{
      uuid: string;
      name: string;
      offsetDays: number;
      template: string;
    }>;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Create (US1, FR-001)
  // ---------------------------------------------------------------------------

  async create(
    user: AuthUser,
    dto: CreateCampaignDto,
  ): Promise<{
    uuid: string;
    name: string;
    status: CampaignStatus;
    organizationId: string;
    createdAt: Date;
  }> {
    const organizationId = this.requireOrg(user);
    const created = await this.prisma.campaign.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        template: dto.template,
        templateD3: dto.templateD3,
        templateD180: dto.templateD180,
        templateD365: dto.templateD365,
        segment: dto.segment
          ? (dto.segment as Prisma.InputJsonValue)
          : undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        status: 'DRAFT',
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.create',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign created campaign=${created.uuid}`,
      metadata: { campaignId: created.uuid },
    });
    this.emitEvent(
      'CampaignCreated',
      buildCampaignCreatedEvent(
        created.uuid,
        organizationId,
        created.name,
        created.type,
        user.id,
        created.createdAt.toISOString(),
      ),
    );

    return {
      uuid: created.uuid,
      name: created.name,
      status: created.status,
      organizationId: created.organizationId,
      createdAt: created.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // List / detail (US2, FR-002/FR-003)
  // ---------------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: QueryCampaignsDto,
  ): Promise<CampaignListResult> {
    const organizationId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const orderBy = this.buildSort(query.sort);

    const where: Prisma.CampaignWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [total, campaigns] = await Promise.all([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const stats = await this.loadCampaignStats(campaigns.map((c) => c.id));
    const data = campaigns.map((campaign) =>
      toCampaignSummary(campaign, stats.get(campaign.id)),
    );

    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async detail(user: AuthUser, uuid: string): Promise<CampaignDetail> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.prisma.campaign.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
    if (!campaign) {
      throw this.campaignNotFound();
    }
    const stats = await this.loadCampaignStats([campaign.id]);
    const detail = toCampaignSummary(campaign, stats.get(campaign.id));
    return {
      ...detail,
      template: campaign.template,
      updatedAt: campaign.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Update (US3, FR-004) — DRAFT only
  // ---------------------------------------------------------------------------

  async update(
    user: AuthUser,
    uuid: string,
    dto: UpdateCampaignDto,
  ): Promise<{ uuid: string; name: string; status: CampaignStatus }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaign(organizationId, uuid);
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign can only be updated while DRAFT',
        },
      });
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        template: dto.template,
        templateD3: dto.templateD3,
        templateD180: dto.templateD180,
        templateD365: dto.templateD365,
        segment: dto.segment
          ? (dto.segment as Prisma.InputJsonValue)
          : undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.update',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign updated campaign=${updated.uuid}`,
      metadata: { campaignId: updated.uuid },
    });
    this.emitEvent(
      'CampaignUpdated',
      buildCampaignUpdatedEvent(
        updated.uuid,
        organizationId,
        user.id,
        updated.updatedAt.toISOString(),
      ),
    );

    return { uuid: updated.uuid, name: updated.name, status: updated.status };
  }

  // ---------------------------------------------------------------------------
  // Activate (US5, FR-006) — guarded DRAFT→ACTIVE + segment + bulk automations
  // ---------------------------------------------------------------------------

  async activate(
    user: AuthUser,
    uuid: string,
  ): Promise<{
    uuid: string;
    status: 'ACTIVE';
    automationCount: number;
    startedAt: Date;
  }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaignWithSequence(
      organizationId,
      uuid,
    );
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign is not in DRAFT state',
        },
      });
    }

    const segment = campaign.segment as CampaignSegmentDto | null;
    const followUpSequence = campaign.followUpSequence as {
      uuid: string;
      warrantyMonths: number;
      stages: Array<{
        uuid: string;
        name: string;
        offsetDays: number;
        template: string;
      }>;
    } | null;

    // If campaign has a followUpSequence, validate it has stages
    if (
      followUpSequence &&
      (!followUpSequence.stages || followUpSequence.stages.length === 0)
    ) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La secuencia de seguimiento no tiene etapas definidas',
        },
      });
    }

    const now = new Date();
    const scheduledDate =
      campaign.startAt && campaign.startAt > now ? campaign.startAt : now;

    let automationCount = 0;
    await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.campaign.updateMany({
        where: { uuid, organizationId, status: 'DRAFT', deletedAt: null },
        data: { status: 'ACTIVE' },
      });
      if (guarded.count === 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Campaign is not in DRAFT state',
          },
        });
      }

      // If campaign has a followUpSequence, use its stages; otherwise use single template
      const useFollowUpSequence = !!followUpSequence;

      const rows = await this.resolveSegmentPurchases(
        tx,
        organizationId,
        segment,
      );
      if (rows.length > MAX_AUTOMATIONS_PER_CAMPAIGN) {
        throw new BadRequestException({
          error: {
            code: 'SEGMENT_TOO_LARGE',
            message: `Segment exceeds the limit of ${MAX_AUTOMATIONS_PER_CAMPAIGN} automations`,
          },
        });
      }

      if (useFollowUpSequence) {
        // Generate one automation per stage per qualifying purchase
        // scheduledDate = purchase.warrantyExpiresAt + stage.offsetDays
        automationCount = await this.generateAutomationsFromSequence(
          tx,
          campaign.id,
          organizationId,
          rows,
          followUpSequence.stages,
        );
      } else {
        // Original single-template logic
        for (let i = 0; i < rows.length; i += CAMPAIGN_BATCH_SIZE) {
          const batch = rows.slice(i, i + CAMPAIGN_BATCH_SIZE);
          const cycles = await tx.commercialCycle.findMany({
            where: {
              purchaseId: { in: batch.map((row) => row.purchaseId) },
              deletedAt: null,
            },
            select: { id: true, status: true, purchaseId: true },
          });
          const cycleByPurchase = new Map(
            cycles.map((cycle) => [cycle.purchaseId, cycle]),
          );

          const automationRows: Array<{
            organizationId: string;
            purchaseId: string;
            campaignId: string;
            commercialCycleId: string;
            scheduledDate: Date;
            status: 'SCHEDULED';
            priority: number;
          }> = [];

          for (const row of batch) {
            const existing = cycleByPurchase.get(row.purchaseId);
            let cycleId: string;
            if (!existing) {
              const created = await tx.commercialCycle.create({
                data: {
                  purchaseId: row.purchaseId,
                  status: 'ACTIVE',
                  startDate: row.purchaseDate,
                },
                select: { id: true },
              });
              cycleId = created.id;
            } else if (existing.status === 'ACTIVE') {
              cycleId = existing.id;
            } else {
              await tx.commercialCycle.update({
                where: { id: existing.id },
                data: {
                  status: 'ACTIVE',
                  startDate: row.purchaseDate,
                  endDate: null,
                },
              });
              cycleId = existing.id;
            }
            automationRows.push({
              organizationId,
              purchaseId: row.purchaseId,
              campaignId: campaign.id,
              commercialCycleId: cycleId,
              scheduledDate,
              status: 'SCHEDULED',
              priority: 0,
            });
          }

          await tx.automation.createMany({ data: automationRows });
        }
        automationCount = rows.length;
      }
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.activate',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign activated campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid, automationCount },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'campaign.automations.generated',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign automations generated campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid, automationCount },
    });
    this.emitEvent(
      'CampaignActivated',
      buildCampaignActivatedEvent(
        campaign.uuid,
        organizationId,
        user.id,
        scheduledDate.toISOString(),
        automationCount,
      ),
    );

    return {
      uuid: campaign.uuid,
      status: 'ACTIVE',
      automationCount,
      startedAt: scheduledDate,
    };
  }

  // ---------------------------------------------------------------------------
  // Pause / resume (US6, FR-007/FR-008)
  // ---------------------------------------------------------------------------

  async pause(
    user: AuthUser,
    uuid: string,
  ): Promise<{ uuid: string; status: 'PAUSED' }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaign(organizationId, uuid);
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign is not in ACTIVE state',
        },
      });
    }

    await this.prisma.campaign.updateMany({
      where: { uuid, organizationId, status: 'ACTIVE', deletedAt: null },
      data: { status: 'PAUSED' },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.pause',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign paused campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid },
    });
    this.emitEvent(
      'CampaignUpdated',
      buildCampaignUpdatedEvent(
        campaign.uuid,
        organizationId,
        user.id,
        new Date().toISOString(),
      ),
    );

    return { uuid: campaign.uuid, status: 'PAUSED' };
  }

  async resume(
    user: AuthUser,
    uuid: string,
  ): Promise<{ uuid: string; status: 'ACTIVE' }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaign(organizationId, uuid);
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign is not in PAUSED state',
        },
      });
    }

    await this.prisma.campaign.updateMany({
      where: { uuid, organizationId, status: 'PAUSED', deletedAt: null },
      data: { status: 'ACTIVE' },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.resume',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign resumed campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid },
    });
    this.emitEvent(
      'CampaignActivated',
      buildCampaignActivatedEvent(
        campaign.uuid,
        organizationId,
        user.id,
        new Date().toISOString(),
        0,
      ),
    );

    return { uuid: campaign.uuid, status: 'ACTIVE' };
  }

  // ---------------------------------------------------------------------------
  // Cancel (US7, FR-009) — terminal; cancels pending automations
  // ---------------------------------------------------------------------------

  async cancel(
    user: AuthUser,
    uuid: string,
  ): Promise<{ uuid: string; status: 'CANCELLED' }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaign(organizationId, uuid);
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.ACTIVE &&
      campaign.status !== CampaignStatus.PAUSED
    ) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign is already in a terminal state',
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.campaign.updateMany({
        where: {
          uuid,
          organizationId,
          status: {
            in: [
              CampaignStatus.DRAFT,
              CampaignStatus.ACTIVE,
              CampaignStatus.PAUSED,
            ],
          },
          deletedAt: null,
        },
        data: { status: 'CANCELLED' },
      });
      if (guarded.count === 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Campaign is already in a terminal state',
          },
        });
      }
      await tx.automation.updateMany({
        where: {
          campaignId: campaign.id,
          status: 'SCHEDULED',
          deletedAt: null,
        },
        data: { status: 'CANCELLED' },
      });
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.cancel',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign cancelled campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid },
    });
    this.emitEvent(
      'CampaignCancelled',
      buildCampaignCancelledEvent(
        campaign.uuid,
        organizationId,
        user.id,
        new Date().toISOString(),
      ),
    );

    return { uuid: campaign.uuid, status: 'CANCELLED' };
  }

  // ---------------------------------------------------------------------------
  // Segment preview (US4, FR-005) — dry-run, no automations created
  // ---------------------------------------------------------------------------

  async previewSegment(
    user: AuthUser,
    uuid: string,
    dto?: PreviewSegmentDto,
  ): Promise<{ count: number }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaign(organizationId, uuid);
    if (!campaign) {
      throw this.campaignNotFound();
    }

    const segment =
      dto && hasSegmentCriterion(dto)
        ? dto
        : (campaign.segment as CampaignSegmentDto | null);
    if (segment && !hasSegmentCriterion(segment)) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'segment must include at least one criterion',
        },
      });
    }

    const rows = await this.resolveSegmentPurchases(
      this.prisma,
      organizationId,
      segment,
    );

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.preview_segment',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign segment preview campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid, count: rows.length },
    });

    return { count: rows.length };
  }

  // ---------------------------------------------------------------------------
  // Finish detection (US8, FR-010) — @OnEvent('AutomationExecuted')
  // ---------------------------------------------------------------------------

  @OnEvent('AutomationExecuted')
  async handleAutomationExecuted(
    event: AutomationExecutedEnvelope,
  ): Promise<void> {
    const automationId = event.payload.automationId;
    try {
      const automation = await this.prisma.automation.findUnique({
        where: { uuid: automationId },
        select: {
          campaignId: true,
          organizationId: true,
          campaign: { select: { uuid: true } },
        },
      });
      if (!automation || !automation.campaignId || !automation.campaign) {
        return;
      }

      const remaining = await this.prisma.automation.count({
        where: {
          campaignId: automation.campaignId,
          status: 'SCHEDULED',
          deletedAt: null,
        },
      });
      if (remaining > 0) {
        return;
      }

      const finished = await this.prisma.campaign.updateMany({
        where: {
          id: automation.campaignId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        data: { status: 'FINISHED' },
      });
      if (finished.count === 0) {
        return;
      }

      await this.auditService.record({
        module: MODULE,
        action: 'campaign.finish',
        outcome: 'success',
        userId: null,
        organizationId: automation.organizationId,
        description: `campaign finished campaign=${automation.campaign.uuid}`,
        metadata: { campaignId: automation.campaign.uuid },
      });
      this.emitEvent(
        'CampaignFinished',
        buildCampaignFinishedEvent(
          automation.campaign.uuid,
          automation.organizationId,
          new Date().toISOString(),
        ),
      );
    } catch (error) {
      this.logger.error(
        `campaign finish detection failed automation=${automationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private requireOrg(user: AuthUser): string {
    if (user.accountType !== 'ORGANIZATION' || !user.organizationId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Organization scope required' },
      });
    }
    return user.organizationId;
  }

  private async findScopedCampaign(
    organizationId: string,
    uuid: string,
  ): Promise<CampaignRow | null> {
    return this.prisma.campaign.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
  }

  private async findScopedCampaignWithSequence(
    organizationId: string,
    uuid: string,
  ): Promise<CampaignRow | null> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { uuid, organizationId, deletedAt: null },
      include: {
        followUpSequence: {
          include: {
            stages: {
              where: { deletedAt: null },
              orderBy: { offsetDays: 'asc' },
            },
          },
        },
      },
    });
    return campaign;
  }

  private campaignNotFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
    });
  }

  private async generateAutomationsFromSequence(
    tx: Prisma.TransactionClient,
    campaignId: string,
    organizationId: string,
    rows: Array<{ purchaseId: string; customerId: string; purchaseDate: Date }>,
    stages: Array<{
      uuid: string;
      name: string;
      offsetDays: number;
      template: string;
    }>,
  ): Promise<number> {
    let automationCount = 0;

    for (let i = 0; i < rows.length; i += CAMPAIGN_BATCH_SIZE) {
      const batch = rows.slice(i, i + CAMPAIGN_BATCH_SIZE);
      const cycles = await tx.commercialCycle.findMany({
        where: {
          purchaseId: { in: batch.map((row) => row.purchaseId) },
          deletedAt: null,
        },
        select: { id: true, status: true, purchaseId: true },
      });
      const cycleByPurchase = new Map(
        cycles.map((cycle) => [cycle.purchaseId, cycle]),
      );

      // Get purchases with warrantyExpiresAt for this batch
      const purchaseIds = batch.map((row) => row.purchaseId);
      const purchases = await tx.purchase.findMany({
        where: { id: { in: purchaseIds }, deletedAt: null },
        select: { id: true, warrantyExpiresAt: true },
      });
      const purchaseWarrantyMap = new Map(
        purchases.map((p) => [p.id, p.warrantyExpiresAt]),
      );

      for (const row of batch) {
        const warrantyExpiresAt = purchaseWarrantyMap.get(row.purchaseId);
        if (!warrantyExpiresAt) {
          // Skip if no warranty expiration date
          continue;
        }

        const existing = cycleByPurchase.get(row.purchaseId);
        let cycleId: string;
        if (!existing) {
          const created = await tx.commercialCycle.create({
            data: {
              purchaseId: row.purchaseId,
              status: 'ACTIVE',
              startDate: row.purchaseDate,
            },
            select: { id: true },
          });
          cycleId = created.id;
        } else if (existing.status === 'ACTIVE') {
          cycleId = existing.id;
        } else {
          await tx.commercialCycle.update({
            where: { id: existing.id },
            data: {
              status: 'ACTIVE',
              startDate: row.purchaseDate,
              endDate: null,
            },
          });
          cycleId = existing.id;
        }

        // Create one automation per stage
        for (const stage of stages) {
          const scheduledDate = new Date(warrantyExpiresAt);
          scheduledDate.setDate(scheduledDate.getDate() + stage.offsetDays);

          await tx.automation.create({
            data: {
              organizationId,
              purchaseId: row.purchaseId,
              campaignId,
              commercialCycleId: cycleId,
              scheduledDate,
              status: 'SCHEDULED',
              priority: 0,
              // Snapshot (HG-FUS-02 option A): the automation is
              // self-sufficient — later sequence edits do not affect
              // already generated campaigns/automations.
              messageTemplate: stage.template,
            },
          });
          automationCount++;
        }
      }
    }
    return automationCount;
  }

  private async loadCampaignStats(
    ids: string[],
  ): Promise<Map<string, CampaignStats>> {
    if (ids.length === 0) {
      return new Map();
    }
    const [total, executed] = await Promise.all([
      this.prisma.automation.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.automation.groupBy({
        by: ['campaignId'],
        where: {
          campaignId: { in: ids },
          status: 'EXECUTED',
          deletedAt: null,
        },
        _count: { _all: true },
      }),
    ]);
    const totalMap = new Map(
      total.map((row) => [row.campaignId, row._count._all]),
    );
    const executedMap = new Map(
      executed.map((row) => [row.campaignId, row._count._all]),
    );
    return new Map(
      ids.map((id) => [
        id,
        {
          automationCount: totalMap.get(id) ?? 0,
          executedCount: executedMap.get(id) ?? 0,
        },
      ]),
    );
  }

  private async resolveSegmentPurchases(
    client: Prisma.TransactionClient,
    organizationId: string,
    segment: CampaignSegmentDto | null,
  ): Promise<
    Array<{ purchaseId: string; customerId: string; purchaseDate: Date }>
  > {
    const where: Prisma.PurchaseWhereInput = {
      organizationId,
      deletedAt: null,
      customer: {
        deletedAt: null,
        ...(segment?.city
          ? { city: { contains: segment.city, mode: 'insensitive' } }
          : {}),
        ...(segment?.customerStatus ? { status: segment.customerStatus } : {}),
      },
      ...(segment?.productId ? { product: { uuid: segment.productId } } : {}),
      ...(segment?.purchaseFrom || segment?.purchaseTo
        ? {
            purchaseDate: {
              ...(segment.purchaseFrom
                ? {
                    gte: this.resolveDateBoundary(segment.purchaseFrom, false),
                  }
                : {}),
              ...(segment.purchaseTo
                ? { lte: this.resolveDateBoundary(segment.purchaseTo, true) }
                : {}),
            },
          }
        : {}),
      ...(segment?.warrantyExpiresFrom || segment?.warrantyExpiresTo
        ? {
            warrantyExpiresAt: {
              ...(segment.warrantyExpiresFrom
                ? {
                    gte: this.resolveDateBoundary(
                      segment.warrantyExpiresFrom,
                      false,
                    ),
                  }
                : {}),
              ...(segment.warrantyExpiresTo
                ? {
                    lte: this.resolveDateBoundary(
                      segment.warrantyExpiresTo,
                      true,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(segment?.warrantyMonths
        ? { product: { warrantyMonths: segment.warrantyMonths } }
        : {}),
    };

    const purchases = await client.purchase.findMany({
      where,
      select: { id: true, customerId: true, purchaseDate: true },
      orderBy: { purchaseDate: 'desc' },
    });

    // One automation per qualifying customer (most recent purchase, C-06/HG-6).
    const seen = new Set<string>();
    const rows: Array<{
      purchaseId: string;
      customerId: string;
      purchaseDate: Date;
    }> = [];
    for (const purchase of purchases) {
      if (seen.has(purchase.customerId)) {
        continue;
      }
      seen.add(purchase.customerId);
      rows.push({
        purchaseId: purchase.id,
        customerId: purchase.customerId,
        purchaseDate: purchase.purchaseDate,
      });
    }
    return rows;
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
    sort?: string,
  ): Prisma.CampaignOrderByWithRelationInput | undefined {
    const raw = sort ?? '-createdAt';
    const field = raw.replace(/^-/, '');
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid sort field: ${field}`,
        },
      });
    }
    return { [field]: raw.startsWith('-') ? 'desc' : 'asc' };
  }

  private emitEvent<T>(
    event: string,
    envelope: CampaignEventEnvelope<T>,
  ): void {
    this.eventEmitter.emit(event, envelope);
  }
}

function hasSegmentCriterion(segment: CampaignSegmentDto): boolean {
  return (
    segment.city !== undefined ||
    segment.productId !== undefined ||
    segment.purchaseFrom !== undefined ||
    segment.purchaseTo !== undefined ||
    segment.customerStatus !== undefined ||
    segment.warrantyExpiresFrom !== undefined ||
    segment.warrantyExpiresTo !== undefined ||
    segment.warrantyMonths !== undefined
  );
}

function toCampaignSummary(
  campaign: {
    uuid: string;
    name: string;
    description: string | null;
    type: CampaignType;
    status: CampaignStatus;
    startAt: Date | null;
    segment: Prisma.JsonValue | null;
    createdAt: Date;
  },
  stats?: CampaignStats,
): CampaignSummary {
  return {
    uuid: campaign.uuid,
    name: campaign.name,
    description: campaign.description,
    type: campaign.type,
    status: campaign.status,
    startAt: campaign.startAt,
    segment: campaign.segment,
    automationCount: stats?.automationCount ?? 0,
    executedCount: stats?.executedCount ?? 0,
    createdAt: campaign.createdAt,
  };
}
