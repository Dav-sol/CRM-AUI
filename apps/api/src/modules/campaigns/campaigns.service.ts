import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  CampaignStatus,
  CampaignType,
  ChannelType,
  FollowUpStageAnchor,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { findInvalidVariables } from '../../common/message-variables';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { CampaignSegmentDto } from './dto/campaign-segment.dto';
import { PreviewSegmentDto } from './dto/preview-segment.dto';
import { PreviewSegmentDraftDto } from './dto/preview-segment-draft.dto';
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

// Emitido por AutomationsModule (automations.events.ts) después de crear el
// ciclo comercial de una compra recién registrada: alta manual o importación.
interface CommercialCycleStartedEnvelope {
  organizationId?: string;
  payload?: {
    // uuid de la compra (no el id interno).
    purchaseId?: string;
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
  // Fase 1: etapas inline del timeline del editor (sin secuencia).
  stages: InlineCampaignStage[];
  followUpSequence: {
    uuid: string;
    name: string;
    warrantyMonths: number;
    stageCount: number;
    // Fase P0-A: etapas con su mensaje para el preview real.
    stages: Array<{
      uuid: string;
      name: string;
      anchor: FollowUpStageAnchor;
      offsetDays: number;
      template: string;
      templateOnPast: string | null;
    }>;
  } | null;
  // Métricas de atribución (Fase 2/P0-D): entregados = mensajes OUTBOUND
  // enviados; respondidos = INBOUND atribuidos; cotizaciones/ventas/ingresos
  // = cadena conversación → cotización → venta atribuida a la campaña.
  delivered: number;
  responded: number;
  quotes: number;
  sales: number;
  revenue: number;
  estimatedCost: number;
  roi: number | null;
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
  templateD3: string | null;
  templateD180: string | null;
  templateD365: string | null;
  status: CampaignStatus;
  channel: ChannelType;
  startAt: Date | null;
  segment: Prisma.JsonValue | null;
  stages: Prisma.JsonValue | null;
  followUpSequenceId: string | null;
  followUpSequence?: {
    uuid: string;
    warrantyMonths: number;
    stages: Array<{
      uuid: string;
      name: string;
      anchor: FollowUpStageAnchor;
      offsetDays: number;
      template: string;
      templateOnPast: string | null;
    }>;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

// Fase 1: etapa inline persistida en Campaign.stages (Json). Misma semántica
// que una etapa de secuencia pero sin identidad propia.
interface InlineCampaignStage {
  name: string | null;
  anchor: FollowUpStageAnchor;
  offsetDays: number;
  template: string;
  templateOnPast: string | null;
}

function parseInlineStages(
  raw: Prisma.JsonValue | null,
): InlineCampaignStage[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const parsed: InlineCampaignStage[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('anchor' in item) ||
      !('offsetDays' in item) ||
      !('template' in item)
    ) {
      continue;
    }
    const stage = item as Record<string, unknown>;
    if (
      (stage.anchor !== 'PURCHASE_DATE' &&
        stage.anchor !== 'WARRANTY_EXPIRY') ||
      typeof stage.offsetDays !== 'number' ||
      typeof stage.template !== 'string'
    ) {
      continue;
    }
    parsed.push({
      name: typeof stage.name === 'string' ? stage.name : null,
      anchor: stage.anchor,
      offsetDays: stage.offsetDays,
      template: stage.template,
      templateOnPast:
        typeof stage.templateOnPast === 'string' &&
        stage.templateOnPast.length > 0
          ? stage.templateOnPast
          : null,
    });
  }
  return parsed;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
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

    // Fase 1: las etapas inline son excluyentes con la secuencia.
    if (dto.followUpSequenceId && dto.stages && dto.stages.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Cannot combine followUpSequenceId with inline stages; choose one',
        },
      });
    }

    const followUpSequenceInternalId = await this.resolveFollowUpSequenceId(
      dto.followUpSequenceId,
      organizationId,
    );

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
        channel: dto.channel ?? 'WHATSAPP_CLIENTS',
        segment: dto.segment
          ? (dto.segment as Prisma.InputJsonValue)
          : undefined,
        stages:
          dto.stages && dto.stages.length > 0
            ? (dto.stages as unknown as Prisma.InputJsonValue)
            : undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        followUpSequenceId: followUpSequenceInternalId,
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
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: this.resolveDateBoundary(query.createdFrom, false) }
                : {}),
              ...(query.createdTo
                ? { lte: this.resolveDateBoundary(query.createdTo, true) }
                : {}),
            },
          }
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
      include: {
        followUpSequence: {
          select: {
            uuid: true,
            name: true,
            warrantyMonths: true,
            stages: {
              where: { deletedAt: null },
              select: {
                id: true,
                name: true,
                anchor: true,
                offsetDays: true,
                template: true,
                templateOnPast: true,
              },
            },
          },
        },
      },
    });
    if (!campaign) {
      throw this.campaignNotFound();
    }
    const stats = await this.loadCampaignStats([campaign.id]);
    const detail = toCampaignSummary(campaign, stats.get(campaign.id));
    const attribution = await this.loadCampaignAttribution(
      campaign.id,
      campaign.uuid,
    );
    return {
      ...detail,
      template: campaign.template,
      updatedAt: campaign.updatedAt,
      stages: parseInlineStages(campaign.stages),
      followUpSequence: campaign.followUpSequence
        ? {
            uuid: campaign.followUpSequence.uuid,
            name: campaign.followUpSequence.name,
            warrantyMonths: campaign.followUpSequence.warrantyMonths,
            stageCount: campaign.followUpSequence.stages.length,
            stages: campaign.followUpSequence.stages.map((stage) => ({
              uuid: stage.id,
              name: stage.name,
              anchor: stage.anchor,
              offsetDays: stage.offsetDays,
              template: stage.template,
              templateOnPast: stage.templateOnPast,
            })),
          }
        : null,
      delivered: attribution.delivered,
      responded: attribution.responded,
      quotes: attribution.quotes,
      sales: attribution.sales,
      revenue: attribution.revenue,
      estimatedCost: attribution.estimatedCost,
      roi: attribution.roi,
    };
  }

  // ---------------------------------------------------------------------------
  // Update (US3, FR-004) — DRAFT, APPROVED, or ACTIVE (ACTIVE = template-only)
  // ---------------------------------------------------------------------------

  /** Fields allowed when campaign status is ACTIVE */
  private static readonly ACTIVE_ALLOWED_FIELDS = new Set([
    'name',
    'description',
    'template',
    'templateD3',
    'templateD180',
    'templateD365',
  ]);

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

    const isActive = campaign.status === CampaignStatus.ACTIVE;
    const isEditable =
      campaign.status === CampaignStatus.DRAFT ||
      campaign.status === CampaignStatus.APPROVED ||
      isActive;

    if (!isEditable) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Campaign can only be updated while DRAFT, APPROVED, or ACTIVE',
        },
      });
    }

    const hasChanges =
      dto.name !== undefined ||
      dto.description !== undefined ||
      dto.type !== undefined ||
      dto.template !== undefined ||
      dto.templateD3 !== undefined ||
      dto.templateD180 !== undefined ||
      dto.templateD365 !== undefined ||
      dto.segment !== undefined ||
      dto.stages !== undefined ||
      dto.startAt !== undefined ||
      dto.followUpSequenceId !== undefined;
    if (!hasChanges) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one field must be provided',
        },
      });
    }

    // ACTIVE campaigns: only name, description, and template fields allowed
    if (isActive) {
      const blockedFields = (
        ['type', 'segment', 'stages', 'startAt', 'followUpSequenceId'] as const
      ).filter((f) => dto[f] !== undefined);

      if (blockedFields.length > 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Cannot modify segment, stages, startAt, type, or followUpSequenceId on an ACTIVE campaign. Pause the campaign first.',
          },
        });
      }
    }

    // Fase 1: las etapas inline son excluyentes con la secuencia. La secuencia
    // existente de la campaña cuenta como combinación inválida.
    const effectiveSequenceId =
      dto.followUpSequenceId !== undefined
        ? dto.followUpSequenceId
        : campaign.followUpSequenceId;
    if (effectiveSequenceId && dto.stages && dto.stages.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Cannot combine followUpSequenceId with inline stages; choose one',
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
        stages:
          dto.stages !== undefined
            ? (dto.stages as unknown as Prisma.InputJsonValue)
            : undefined,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
        followUpSequenceId:
          dto.followUpSequenceId !== undefined
            ? await this.resolveFollowUpSequenceId(
                dto.followUpSequenceId,
                organizationId,
              )
            : undefined,
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
    skippedByLimit: number;
    skippedByFrequency: number;
  }> {
    const organizationId = this.requireOrg(user);
    const campaign = await this.findScopedCampaignWithSequence(
      organizationId,
      uuid,
    );
    if (!campaign) {
      throw this.campaignNotFound();
    }
    if (campaign.status !== CampaignStatus.APPROVED) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign must be APPROVED before activation',
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
        anchor: FollowUpStageAnchor;
        offsetDays: number;
        template: string;
        templateOnPast: string | null;
      }>;
    } | null;

    // P0.2: no se activa una campaña sin mensajes válidos ni sin audiencia.
    this.assertValidMessages(campaign);
    const audience = await this.prisma.purchase.count({
      where: this.buildSegmentWhere(segment, organizationId),
    });
    if (audience === 0) {
      await this.auditService.record({
        module: MODULE,
        action: 'campaign.activate',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'no_audience' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot activate a campaign without an audience',
        },
      });
    }

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
    let skippedByLimit = 0;
    let skippedByFrequency = 0;
    await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.campaign.updateMany({
        where: { uuid, organizationId, status: 'APPROVED', deletedAt: null },
        data: { status: 'ACTIVE' },
      });
      if (guarded.count === 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Campaign must be APPROVED before activation',
          },
        });
      }

      // If campaign has a followUpSequence, use its stages; otherwise use
      // inline editor stages when present; otherwise single template.
      const useFollowUpSequence = !!followUpSequence;
      const inlineStages = useFollowUpSequence
        ? []
        : parseInlineStages(campaign.stages);

      const rows = await this.resolveSegmentPurchases(
        tx,
        organizationId,
        segment,
      );
      const totalAutomations =
        rows.length *
        (useFollowUpSequence
          ? followUpSequence.stages.length
          : inlineStages.length > 0
            ? inlineStages.length
            : 1);
      if (totalAutomations > MAX_AUTOMATIONS_PER_CAMPAIGN) {
        throw new BadRequestException({
          error: {
            code: 'SEGMENT_TOO_LARGE',
            message: `Segment exceeds the limit of ${MAX_AUTOMATIONS_PER_CAMPAIGN} automations`,
          },
        });
      }

      if (useFollowUpSequence) {
        // Generate one automation per stage per qualifying purchase
        // scheduledDate = base(anchor) + stage.offsetDays
        const sequenceResult = await this.generateAutomationsFromSequence(
          tx,
          campaign.id,
          organizationId,
          rows,
          followUpSequence.stages,
          campaign.template,
          // Reference = max(startAt, now): the campaign starts operating on
          // this date; stages before it are never sent historically.
          scheduledDate,
          campaign.channel,
        );
        automationCount = sequenceResult.count;
        skippedByLimit += sequenceResult.skippedByLimit;
        skippedByFrequency += sequenceResult.skippedByFrequency;
      } else if (inlineStages.length > 0) {
        // Fase 1: etapas inline del editor — misma generación que secuencia
        // (TRANSACTIONAL, conversión recompra de etapas pasadas, HG-SEM-03/F4).
        const inlineResult = await this.generateAutomationsFromSequence(
          tx,
          campaign.id,
          organizationId,
          rows,
          inlineStages.map((stage) => ({
            uuid: '',
            name: stage.name ?? 'Etapa',
            anchor: stage.anchor,
            offsetDays: stage.offsetDays,
            template: stage.template,
            templateOnPast: stage.templateOnPast,
          })),
          campaign.template,
          scheduledDate,
          campaign.channel,
        );
        automationCount = inlineResult.count;
        skippedByLimit += inlineResult.skippedByLimit;
        skippedByFrequency += inlineResult.skippedByFrequency;
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
            purpose: 'COMMERCIAL';
            stageName: string;
            channel: ChannelType;
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
            // Legacy single-template sends are COMMERCIAL: respect the anti-spam
            // limits per customer (playbook §14).
            const allowed = await this.commercialAllowed(
              tx,
              organizationId,
              row.customerId,
            );
            if (allowed !== 'ok') {
              if (allowed === 'limit') {
                skippedByLimit++;
              } else {
                skippedByFrequency++;
              }
              continue;
            }
            automationRows.push({
              organizationId,
              purchaseId: row.purchaseId,
              campaignId: campaign.id,
              commercialCycleId: cycleId,
              scheduledDate,
              status: 'SCHEDULED',
              priority: 0,
              purpose: 'COMMERCIAL',
              stageName: 'Mensaje de campaña',
              channel: campaign.channel,
            });
          }

          await tx.automation.createMany({ data: automationRows });
          automationCount += automationRows.length;
        }
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
      // Fase 4 (T16): clientes del segmento omitidos por anti-spam.
      skippedByLimit,
      skippedByFrequency,
    };
  }

  // ---------------------------------------------------------------------------
  // Approve (playbook §20): marketing approves the campaign before it can be
  // activated. DRAFT -> APPROVED; activation requires APPROVED.
  // ---------------------------------------------------------------------------

  async approve(
    user: AuthUser,
    uuid: string,
  ): Promise<{ uuid: string; status: CampaignStatus }> {
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
          message: 'Only DRAFT campaigns can be approved',
        },
      });
    }

    // P0.2: no se aprueba una campaña sin mensajes, con variables inválidas o
    // sin audiencia.
    this.assertValidMessages(campaign);
    const audience = await this.prisma.purchase.count({
      where: this.buildSegmentWhere(
        campaign.segment as CampaignSegmentDto | null,
        organizationId,
      ),
    });
    if (audience === 0) {
      await this.auditService.record({
        module: MODULE,
        action: 'campaign.approved',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'no_audience' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot approve a campaign without an audience',
        },
      });
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'APPROVED' },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.approved',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign approved campaign=${updated.uuid}`,
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

    return { uuid: updated.uuid, status: updated.status };
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
      campaign.status !== CampaignStatus.APPROVED &&
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

  // Fase 3 (P0-5): preview stateless para el creador (sin uuid de campaña).
  async previewSegmentDraft(
    user: AuthUser,
    dto: PreviewSegmentDraftDto,
  ): Promise<{
    count: number;
    estimatedAutomations: number;
    estimatedMessages: number;
    estimatedSegments: number;
    estimatedCost: number;
    currency: string;
  }> {
    const organizationId = this.requireOrg(user);
    if (dto.segment && !hasSegmentCriterion(dto.segment)) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'segment must include at least one criterion',
        },
      });
    }
    return this.estimateSegment(
      organizationId,
      dto.segment ?? null,
      dto.followUpSequenceId,
      dto.type,
      dto.channel,
    );
  }

  async previewSegment(
    user: AuthUser,
    uuid: string,
    dto?: PreviewSegmentDto,
  ): Promise<{
    count: number;
    estimatedAutomations: number;
    estimatedMessages: number;
    estimatedSegments: number;
    estimatedCost: number;
    currency: string;
  }> {
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

    const result = await this.estimateSegment(
      organizationId,
      segment,
      campaign.followUpSequenceId,
      campaign.type,
      campaign.channel,
    );

    await this.auditService.record({
      module: MODULE,
      action: 'campaign.preview_segment',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `campaign segment preview campaign=${campaign.uuid}`,
      metadata: { campaignId: campaign.uuid, count: result.count },
    });

    return result;
  }

  // Fase 3: resoluciones de audiencia y costo estimado compartidas.
  private async estimateSegment(
    organizationId: string,
    segment: CampaignSegmentDto | null,
    followUpSequenceId?: string | null,
    campaignType?: CampaignType | null,
    channel?: ChannelType | null,
  ): Promise<{
    count: number;
    estimatedAutomations: number;
    estimatedMessages: number;
    estimatedSegments: number;
    estimatedCost: number;
    currency: string;
  }> {
    const rows = await this.resolveSegmentPurchases(
      this.prisma,
      organizationId,
      segment,
    );
    const stagesCount = followUpSequenceId
      ? await this.prisma.followUpSequenceStage.count({
          where: { sequenceId: followUpSequenceId, deletedAt: null },
        })
      : 1;
    const estimatedAutomations = rows.length * Math.max(stagesCount, 1);

    const isSms = channel === 'SMS';
    const smsCostPerSegment = isSms
      ? (this.configService.get<number>('sms.costPerSegment') ?? 100)
      : 0;
    const smsCurrency = isSms
      ? (this.configService.get<string>('sms.currency') ?? 'COP')
      : 'COP';

    // For SMS: estimate segments per template. Use average segment count.
    // For WhatsApp: use existing per-message flat rate.
    let estimatedSegments = estimatedAutomations;
    let estimatedCost: number;

    if (isSms) {
      estimatedSegments = estimatedAutomations; // 1 segment avg per message (conservative)
      estimatedCost = estimatedSegments * smsCostPerSegment;
    } else {
      const commercial =
        campaignType === 'REPURCHASE' || campaignType === 'SPECIAL';
      const messageCost = commercial
        ? (this.configService.get<number>('campaigns.messageCostCommercial') ??
          400)
        : (this.configService.get<number>('campaigns.messageCost') ?? 200);
      estimatedCost = estimatedAutomations * messageCost;
    }

    return {
      count: rows.length,
      estimatedAutomations,
      estimatedMessages: estimatedAutomations,
      estimatedSegments,
      estimatedCost,
      currency: smsCurrency,
    };
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
          // SCHEDULED (pending) or ERROR (failed, retryable) keep the campaign
          // active; EXECUTING is transient.
          status: { in: ['SCHEDULED', 'ERROR'] },
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
  // Inscripción de compras nuevas (lifecycle por compra)
  // ---------------------------------------------------------------------------
  //
  // Activar una campaña genera las etapas SOLO para las compras que existen
  // en ese momento. Una compra registrada después nace con su propio ciclo
  // (PurchaseImported -> CommercialCycleStarted) y debe entrar en el lifecycle
  // de las campañas ACTIVE que le correspondan: si no, una batería nueva nunca
  // recibiría el día +2, las revisiones ni las etapas de garantía.
  //
  // No se cancela nada de las compras anteriores del mismo cliente (decisión
  // humana 2026-09-27, specs/016-automations-v1 FR-003 vs Q6): el CRM no
  // registra vehículos, así que no puede saber si la nueva compra reemplaza a
  // una batería o corresponde a otro vehículo del cliente. Cada compra mantiene
  // su lifecycle de forma independiente.
  @OnEvent('CommercialCycleStarted')
  async handleCommercialCycleStarted(
    event: CommercialCycleStartedEnvelope,
  ): Promise<void> {
    const purchaseUuid = event?.payload?.purchaseId;
    if (!purchaseUuid) {
      return;
    }
    try {
      await this.enrollPurchaseInActiveCampaigns(purchaseUuid);
    } catch (error) {
      this.logger.error(
        `campaign enrollment failed purchase=${purchaseUuid}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async enrollPurchaseInActiveCampaigns(
    purchaseUuid: string,
  ): Promise<void> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { uuid: purchaseUuid, deletedAt: null },
      select: {
        id: true,
        customerId: true,
        organizationId: true,
        purchaseDate: true,
        customer: { select: { deletedAt: true, noContactAt: true } },
      },
    });
    if (
      !purchase ||
      purchase.customer.deletedAt ||
      purchase.customer.noContactAt
    ) {
      return;
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        organizationId: purchase.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        followUpSequence: {
          include: {
            stages: {
              where: { deletedAt: null },
              orderBy: [{ anchor: 'asc' }, { offsetDays: 'asc' }],
            },
          },
        },
      },
    });

    const now = new Date();
    for (const campaign of campaigns) {
      const segment = campaign.segment as CampaignSegmentDto | null;
      const segmentWhere = this.buildSegmentWhere(
        segment,
        purchase.organizationId,
      );

      // Misma regla que la activación (C-06/HG-6): una sola compra por
      // cliente, y sólo si esta es la más reciente dentro del segmento.
      const inSegment = await this.prisma.purchase.count({
        where: { AND: [segmentWhere, { id: purchase.id }] },
      });
      if (inSegment === 0) {
        continue;
      }
      const newer = await this.prisma.purchase.count({
        where: {
          AND: [
            segmentWhere,
            {
              customerId: purchase.customerId,
              purchaseDate: { gt: purchase.purchaseDate },
            },
          ],
        },
      });
      if (newer > 0) {
        continue;
      }

      // Idempotencia (AU-011): el evento puede repetirse en un reintento de
      // importación, y la compra pudo haberse inscrito en un intento previo.
      const enrolled = await this.prisma.automation.findFirst({
        where: {
          campaignId: campaign.id,
          purchaseId: purchase.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (enrolled) {
        continue;
      }

      const stages = campaign.followUpSequence
        ? campaign.followUpSequence.stages.map((stage) => ({
            uuid: stage.uuid,
            name: stage.name,
            anchor: stage.anchor,
            offsetDays: stage.offsetDays,
            template: stage.template,
            templateOnPast: stage.templateOnPast,
          }))
        : parseInlineStages(campaign.stages).map((stage) => ({
            uuid: '',
            name: stage.name ?? 'Etapa',
            anchor: stage.anchor,
            offsetDays: stage.offsetDays,
            template: stage.template,
            templateOnPast: stage.templateOnPast,
          }));
      if (stages.length === 0) {
        continue;
      }

      const generated = await this.prisma.automation.count({
        where: { campaignId: campaign.id, deletedAt: null },
      });
      if (generated + stages.length > MAX_AUTOMATIONS_PER_CAMPAIGN) {
        this.logger.warn(
          `campaign ${campaign.uuid} reached the ${MAX_AUTOMATIONS_PER_CAMPAIGN} automation limit: purchase ${purchaseUuid} was not enrolled`,
        );
        continue;
      }

      // Misma reference que en la activación: max(startAt, now). Las etapas
      // anteriores a la entrada en vigor no se envían históricamente.
      const reference =
        campaign.startAt && campaign.startAt > now ? campaign.startAt : now;
      const result = await this.prisma.$transaction((tx) =>
        this.generateAutomationsFromSequence(
          tx,
          campaign.id,
          purchase.organizationId,
          [
            {
              purchaseId: purchase.id,
              customerId: purchase.customerId,
              purchaseDate: purchase.purchaseDate,
            },
          ],
          stages,
          campaign.template,
          reference,
          campaign.channel,
        ),
      );
      if (result.count > 0) {
        this.logger.log(
          `purchase ${purchaseUuid} enrolled in campaign ${campaign.uuid}: ${result.count} automation(s)`,
        );
      }
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
              orderBy: [{ anchor: 'asc' }, { offsetDays: 'asc' }],
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

  private async resolveFollowUpSequenceId(
    uuid: string | undefined,
    organizationId: string,
  ): Promise<string | null> {
    if (!uuid) {
      return null;
    }
    const sequence = await this.prisma.followUpSequence.findFirst({
      where: {
        uuid,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sequence) {
      throw new NotFoundException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'FollowUpSequence not found in this organization',
        },
      });
    }
    return sequence.id;
  }

  private async generateAutomationsFromSequence(
    tx: Prisma.TransactionClient,
    campaignId: string,
    organizationId: string,
    rows: Array<{ purchaseId: string; customerId: string; purchaseDate: Date }>,
    stages: Array<{
      uuid?: string;
      name: string;
      anchor: FollowUpStageAnchor;
      offsetDays: number;
      template: string;
      templateOnPast: string | null;
    }>,
    campaignTemplate: string,
    reference: Date,
    channel: ChannelType = 'WHATSAPP_CLIENTS',
  ): Promise<{
    count: number;
    skippedByLimit: number;
    skippedByFrequency: number;
  }> {
    let automationCount = 0;
    let skippedByLimit = 0;
    let skippedByFrequency = 0;

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

        // Estado real de la garantía de ESTA compra respecto de la referencia
        // de generación (max(startAt, now)). Junto con el offset de cada etapa
        // en el lifecycle decide qué significa una etapa que ya pasó; nunca
        // sólo el hecho de que scheduledDate < referencia.
        const warrantyExpired =
          !!warrantyExpiresAt &&
          warrantyExpiresAt.getTime() <= reference.getTime();

        // Fechas de las etapas de garantía con la MISMA fórmula que el bucle
        // de creación (HG-SEM-05: sin warrantyExpiresAt no hay esas etapas).
        const warrantyStageDates: {
          stage: (typeof stages)[number];
          computed: Date;
        }[] = stages
          .filter(
            (stage) =>
              stage.anchor === FollowUpStageAnchor.WARRANTY_EXPIRY &&
              !!warrantyExpiresAt,
          )
          .map((stage) => {
            const computed = new Date(warrantyExpiresAt as Date);
            computed.setDate(computed.getDate() + stage.offsetDays);
            return { stage, computed };
          });

        const pastWarrantyStages = warrantyStageDates.filter(
          (entry) => entry.computed.getTime() < reference.getTime(),
        );
        // Etapa más avanzada de la lista: evita un contacto por cada etapa
        // atrasada del mismo ciclo.
        const latest = (
          entries: typeof pastWarrantyStages,
        ): (typeof pastWarrantyStages)[number] | null =>
          [...entries].sort(
            (a, b) => b.computed.getTime() - a.computed.getTime(),
          )[0] ?? null;

        // offset >= 0 (la etapa llega en o después del vencimiento): si ya
        // pasó, la garantía de ESA compra venció → alimenta la conversión con
        // SU texto (Recompra / renovación).
        const repurchaseStage = latest(
          pastWarrantyStages.filter((entry) => entry.stage.offsetDays >= 0),
        );
        // offset < 0 (D−60/D−30, antes del vencimiento): pasar NO implica
        // vencimiento; su significado lo da warrantyExpired.
        const pastPreExpiryStage = latest(
          pastWarrantyStages.filter((entry) => entry.stage.offsetDays < 0),
        );
        // HG-SEM-03 + F4: una sola conversión por compra, y sólo cuando la
        // garantía REALMENTE venció. Se decide aquí, antes de crear nada, para
        // que F4 no dependa del orden del array ni de que D−30 haya quedado en
        // el pasado.
        const warrantyConverted =
          warrantyExpired &&
          (repurchaseStage !== null || pastPreExpiryStage !== null);
        // D−30 atrasado con garantía todavía vigente: sigue siendo
        // "vencimiento cercano", con SU mensaje (no uno de garantía vencida).
        const preExpiryCatchUp =
          !warrantyExpired && pastPreExpiryStage !== null
            ? pastPreExpiryStage
            : null;

        // Create one automation per stage
        for (const stage of stages) {
          // HG-SEM-05: WARRANTY_EXPIRY stages require a warranty expiration;
          // PURCHASE_DATE stages always generate.
          if (
            stage.anchor === FollowUpStageAnchor.WARRANTY_EXPIRY &&
            !warrantyExpiresAt
          ) {
            continue;
          }

          const base =
            stage.anchor === FollowUpStageAnchor.PURCHASE_DATE
              ? row.purchaseDate
              : (warrantyExpiresAt as Date);
          const computed = new Date(base);
          computed.setDate(computed.getDate() + stage.offsetDays);

          // Lifecycle batería: una etapa anclada a la COMPRA no se genera si
          // cae DESPUÉS del vencimiento de garantía de ESA compra. El tope es
          // la fecha real de warrantyExpiresAt de la compra (nunca una
          // duración fija por meses), de modo que las revisiones +60/+120/…
          // cubren toda la garantía de cada batería y no se pide "revisar
          // para respaldar la garantía" cuando la garantía ya terminó. Sin
          // warrantyExpiresAt no hay tope, igual que HG-SEM-05 omite las
          // etapas de garantía.
          if (
            stage.anchor === FollowUpStageAnchor.PURCHASE_DATE &&
            warrantyExpiresAt &&
            computed.getTime() > warrantyExpiresAt.getTime()
          ) {
            continue;
          }

          if (computed.getTime() < reference.getTime()) {
            // HG-SEM-03: no historical send. Las etapas de garantía pasadas ya
            // se resolvieron ANTES de crear nada: catch-up si la garantía sigue
            // vigente, conversión si ya venció (según offset + warrantyExpiresAt);
            // PURCHASE_DATE pasadas se omiten.
            continue;
          }

          // F4: cuando la conversión de garantía vencida aplica a esta compra,
          // las etapas de recompra posteriores (offsetDays > 0) se sustituyen
          // por esa única conversión — un solo contacto de renovación por
          // ciclo (playbook §11). La decisión es warrantyConverted, no el mero
          // hecho de que D−30 haya quedado en el pasado. Transactional /
          // warranty stages are untouched.
          if (
            warrantyConverted &&
            stage.anchor === FollowUpStageAnchor.WARRANTY_EXPIRY &&
            stage.offsetDays > 0
          ) {
            continue;
          }

          await tx.automation.create({
            data: {
              organizationId,
              purchaseId: row.purchaseId,
              campaignId,
              commercialCycleId: cycleId,
              scheduledDate: computed,
              status: 'SCHEDULED',
              priority: 0,
              // Sequence stages are transactional (warranty/post-purchase):
              // never counted against the commercial 3/60d limit.
              purpose: 'TRANSACTIONAL',
              // Fase 4 (T14): motivo legible de la automatización.
              stageName: stage.name,
              // Fase 1: canal de envío (snapshot de campaña).
              channel,
              // Snapshot (HG-FUS-02 option A): the automation is
              // self-sufficient — later sequence edits do not affect
              // already generated campaigns/automations.
              messageTemplate: stage.template,
            },
          });
          automationCount++;
        }

        // D−60/D−30 atrasados con la garantía todavía VIGENTE: se envía una
        // sola vez (la etapa más avanzada), en este momento, con el mensaje de
        // vencimiento cercano de ESA etapa y propósito TRANSACCIONAL (igual que
        // si llegara programada). No es una conversión: no hay garantía
        // vencida, así que F4 no suprime +60/+90.
        if (preExpiryCatchUp) {
          const { stage } = preExpiryCatchUp;
          await tx.automation.create({
            data: {
              organizationId,
              purchaseId: row.purchaseId,
              campaignId,
              commercialCycleId: cycleId,
              scheduledDate: reference,
              status: 'SCHEDULED',
              priority: 0,
              purpose: 'TRANSACTIONAL',
              stageName: stage.name,
              channel,
              messageTemplate: stage.template,
            },
          });
          automationCount++;
        }

        // Conversión de garantía vencida (HG-SEM-03 + F4): una sola vez por
        // compra y sólo cuando la garantía REALMENTE venció respecto de la
        // referencia de generación. El mensaje sale siempre de una etapa
        // post-vencimiento (offset >= 0): la más avanzada que ya pasó; y si
        // sólo pasaron etapas previas al vencimiento (D−30), de la primera
        // etapa post-vencimiento de la secuencia (D+60). Nunca de D−30: esa
        // etapa siempre habla de "vencimiento cercano".
        if (warrantyConverted) {
          // Repurchase conversion is COMMERCIAL: respect the anti-spam limits
          // per customer (playbook §14). Transactional never blocks.
          const allowed = await this.commercialAllowed(
            tx,
            organizationId,
            row.customerId,
          );
          if (allowed !== 'ok') {
            if (allowed === 'limit') {
              skippedByLimit++;
            } else {
              skippedByFrequency++;
            }
            continue;
          }
          let messageTemplate = campaignTemplate;
          if (repurchaseStage) {
            // Etapa post-vencimiento ya pasada: su propio texto "on past".
            messageTemplate =
              repurchaseStage.stage.templateOnPast ?? campaignTemplate;
          } else {
            // Sólo pasaron etapas previas al vencimiento (D−30): el mensaje
            // sale de la primera etapa post-vencimiento (D+60), nunca del de
            // vencimiento cercano.
            const upcomingPostExpiry = warrantyStageDates
              .filter((entry) => entry.stage.offsetDays >= 0)
              .sort((a, b) => a.computed.getTime() - b.computed.getTime())[0];
            messageTemplate =
              upcomingPostExpiry?.stage.templateOnPast ??
              upcomingPostExpiry?.stage.template ??
              campaignTemplate;
          }
          await tx.automation.create({
            data: {
              organizationId,
              purchaseId: row.purchaseId,
              campaignId,
              commercialCycleId: cycleId,
              scheduledDate: reference,
              status: 'SCHEDULED',
              priority: 0,
              purpose: 'COMMERCIAL',
              stageName: 'Recompra / renovación',
              channel,
              messageTemplate,
            },
          });
          automationCount++;
        }
      }
    }
    return { count: automationCount, skippedByLimit, skippedByFrequency };
  }

  // Playbook §14: a customer may receive at most `maxCommercialPer60d`
  // COMMERCIAL automations within the next 60 days (future scheduled) plus
  // those already sent in the last 60 days. Only COMMERCIAL purpose counts.
  private async commercialAllowed(
    tx: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
  ): Promise<'ok' | 'limit' | 'frequency'> {
    const max =
      this.configService.get<number>('journeys.maxCommercialPer60d') ?? 3;
    const minDays =
      this.configService.get<number>('journeys.minDaysBetweenCommercial') ?? 3;
    if (max <= 0) {
      return 'limit';
    }
    const now = new Date();
    const since = new Date(now.getTime() - 60 * 86_400_000);
    const minSince = new Date(now.getTime() - minDays * 86_400_000);
    const count = await tx.automation.count({
      where: {
        organizationId,
        deletedAt: null,
        purpose: 'COMMERCIAL',
        purchase: { customerId },
        OR: [
          { status: 'SCHEDULED', scheduledDate: { gte: now } },
          { status: 'EXECUTED', executedDate: { gte: since } },
        ],
      },
    });
    if (count >= max) {
      return 'limit';
    }
    if (minDays > 0) {
      // Playbook §14: nunca dos comerciales demasiado cerca.
      const tooClose = await tx.automation.count({
        where: {
          organizationId,
          deletedAt: null,
          purpose: 'COMMERCIAL',
          purchase: { customerId },
          OR: [
            { status: 'EXECUTED', executedDate: { gte: minSince, lte: now } },
            {
              status: 'SCHEDULED',
              scheduledDate: {
                gte: now,
                lte: new Date(now.getTime() + minDays * 86_400_000),
              },
            },
          ],
        },
      });
      if (tooClose > 0) {
        return 'frequency';
      }
    }
    return 'ok';
  }

  // Fase 2/P0-D: entregados/respondidos + cadena comercial atribuida
  // (cotizaciones → ventas → ingresos) y ROI estimado.
  private async loadCampaignAttribution(
    campaignId: string,
    campaignUuid: string,
  ): Promise<{
    delivered: number;
    responded: number;
    quotes: number;
    sales: number;
    revenue: number;
    estimatedCost: number;
    roi: number | null;
  }> {
    const [delivered, responded, quoteAgg] = await Promise.all([
      this.prisma.message.count({
        where: {
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          automation: { campaignId },
          status: { in: ['SENT', 'DELIVERED', 'READ'] },
          deletedAt: null,
        },
      }),
      this.prisma.message.count({
        where: {
          type: 'INCOMING',
          direction: 'INBOUND',
          inReplyToCampaignId: campaignUuid,
          deletedAt: null,
        },
      }),
      this.prisma.quote.aggregate({
        where: { campaignId: campaignUuid, deletedAt: null },
        _count: { _all: true, purchaseId: true },
        _sum: { value: true },
      }),
    ]);

    const quotes = quoteAgg._count._all;
    const sales = quoteAgg._count.purchaseId;
    const revenue =
      (quoteAgg._sum.value?.toNumber() ?? 0) * (sales > 0 ? 1 : 0);
    const messageCost =
      this.configService.get<number>('campaigns.messageCost') ?? 200;
    const estimatedCost = delivered * messageCost;
    const roi =
      estimatedCost > 0 ? (revenue - estimatedCost) / estimatedCost : null;

    return { delivered, responded, quotes, sales, revenue, estimatedCost, roi };
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

  // P0.2: validación transversal de mensajes (aprobación y activación).
  // Rechaza campañas sin mensajes y templates con variables desconocidas.
  private assertValidMessages(campaign: CampaignRow): void {
    const templates = [
      campaign.template,
      campaign.templateD3,
      campaign.templateD180,
      campaign.templateD365,
      ...(campaign.followUpSequence?.stages ?? []).flatMap((stage) => [
        stage.template,
        stage.templateOnPast ?? '',
      ]),
      // Fase 1: etapas inline del editor.
      ...parseInlineStages(campaign.stages).flatMap((stage) => [
        stage.template,
        stage.templateOnPast ?? '',
      ]),
    ].filter((template): template is string =>
      Boolean(template && template.trim().length > 0),
    );

    if (templates.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campaign has no messages',
        },
      });
    }
    const invalid = new Set<string>();
    for (const template of templates) {
      for (const variable of findInvalidVariables(template)) {
        invalid.add(variable);
      }
    }
    if (invalid.size > 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid message variables: ${[...invalid].join(', ')}`,
        },
      });
    }
  }

  private buildSegmentWhere(
    segment: CampaignSegmentDto | null,
    organizationId: string,
  ): Prisma.PurchaseWhereInput {
    return {
      organizationId,
      deletedAt: null,
      customer: {
        deletedAt: null,
        // Fase 5 (T19): los clientes que pidieron no ser contactados no entran
        // en las campañas.
        noContactAt: null,
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
        ? { warrantyMonths: segment.warrantyMonths }
        : {}),
    };
  }

  private async resolveSegmentPurchases(
    client: Prisma.TransactionClient,
    organizationId: string,
    segment: CampaignSegmentDto | null,
  ): Promise<
    Array<{ purchaseId: string; customerId: string; purchaseDate: Date }>
  > {
    const where = this.buildSegmentWhere(segment, organizationId);

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
