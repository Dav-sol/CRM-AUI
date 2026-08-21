import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateFollowUpSequenceDto } from './dto/create-follow-up-sequence.dto';
import { UpdateFollowUpSequenceDto } from './dto/update-follow-up-sequence.dto';
import { QueryFollowUpSequencesDto } from './dto/query-follow-up-sequences.dto';

const MODULE = 'follow_up_sequences';

const SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'warrantyMonths',
]);

const ALLOWED_WARRANTY_MONTHS = [12, 15, 18, 24];

export interface FollowUpSequenceSummary {
  uuid: string;
  name: string;
  description: string | null;
  warrantyMonths: number;
  stageCount: number;
  createdAt: Date;
}

export interface FollowUpSequenceDetail extends FollowUpSequenceSummary {
  stages: FollowUpSequenceStageSummary[];
  updatedAt: Date;
}

export interface FollowUpSequenceStageSummary {
  uuid: string;
  name: string;
  offsetDays: number;
  template: string;
  createdAt: Date;
}

export interface FollowUpSequenceListResult {
  data: FollowUpSequenceSummary[];
  meta: { page: number; limit: number; total: number; pages: number };
}

interface StageWriteInput {
  name?: string;
  offsetDays?: number;
  template?: string;
}

@Injectable()
export class FollowUpSequencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async create(
    user: AuthUser,
    dto: CreateFollowUpSequenceDto,
  ): Promise<{
    uuid: string;
    name: string;
    organizationId: string;
    createdAt: Date;
  }> {
    const organizationId = this.requireOrg(user);

    this.validateStages(dto.stages);
    this.validateWarrantyMonths(dto.warrantyMonths);

    // Single-statement nested create: no concurrent writer can attach stages
    // to a sequence that does not exist yet, so in-memory offset uniqueness
    // is race-free for creation.
    const created = await this.prisma.followUpSequence.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        warrantyMonths: dto.warrantyMonths,
        stages: {
          create: dto.stages.map((stage) => ({
            name: stage.name,
            offsetDays: stage.offsetDays,
            template: stage.template,
            createdBy: user.id,
          })),
        },
        createdBy: user.id,
      },
      include: { stages: true },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'follow_up_sequence.create',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `follow up sequence created seq=${created.uuid}`,
      metadata: { sequenceId: created.uuid, stageCount: created.stages.length },
    });

    return {
      uuid: created.uuid,
      name: created.name,
      organizationId: created.organizationId,
      createdAt: created.createdAt,
    };
  }

  async list(
    user: AuthUser,
    query: QueryFollowUpSequencesDto,
  ): Promise<FollowUpSequenceListResult> {
    const organizationId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const orderBy = this.buildSort(query.sort);

    const where: Prisma.FollowUpSequenceWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.warrantyMonths ? { warrantyMonths: query.warrantyMonths } : {}),
    };

    const [total, sequences] = await Promise.all([
      this.prisma.followUpSequence.count({ where }),
      this.prisma.followUpSequence.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          stages: { select: { id: true }, where: { deletedAt: null } },
        },
      }),
    ]);

    const data = sequences.map((seq) => ({
      uuid: seq.uuid,
      name: seq.name,
      description: seq.description,
      warrantyMonths: seq.warrantyMonths,
      stageCount: seq.stages.length,
      createdAt: seq.createdAt,
    }));

    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async detail(user: AuthUser, uuid: string): Promise<FollowUpSequenceDetail> {
    const organizationId = this.requireOrg(user);
    const sequence = await this.prisma.followUpSequence.findFirst({
      where: { uuid, organizationId, deletedAt: null },
      include: {
        stages: {
          where: { deletedAt: null },
          orderBy: { offsetDays: 'asc' },
        },
      },
    });
    if (!sequence) {
      throw this.sequenceNotFound();
    }
    return {
      uuid: sequence.uuid,
      name: sequence.name,
      description: sequence.description,
      warrantyMonths: sequence.warrantyMonths,
      stageCount: sequence.stages.length,
      createdAt: sequence.createdAt,
      updatedAt: sequence.updatedAt,
      stages: sequence.stages.map((stage) => ({
        uuid: stage.uuid,
        name: stage.name,
        offsetDays: stage.offsetDays,
        template: stage.template,
        createdAt: stage.createdAt,
      })),
    };
  }

  async update(
    user: AuthUser,
    uuid: string,
    dto: UpdateFollowUpSequenceDto,
  ): Promise<{ uuid: string; name: string }> {
    const organizationId = this.requireOrg(user);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent writers on this sequence row before reading any
      // state. The lock targets only the live row; a missing/soft-deleted row
      // locks nothing and falls through to the guarded re-read below.
      await tx.$queryRaw`SELECT id FROM "follow_up_sequences" WHERE uuid = ${uuid} AND organization_id = ${organizationId} AND deleted_at IS NULL FOR UPDATE`;

      const sequence = await tx.followUpSequence.findFirst({
        where: { uuid, organizationId, deletedAt: null },
        select: { id: true, uuid: true },
      });
      if (!sequence) {
        throw this.sequenceNotFound();
      }

      // Usage guard evaluated inside the same transaction as the write so the
      // decision cannot race with a campaign activation referencing it.
      const campaignCount = await tx.campaign.count({
        where: { followUpSequenceId: sequence.id, deletedAt: null },
      });

      if (
        campaignCount > 0 &&
        (dto.warrantyMonths !== undefined || dto.stages !== undefined)
      ) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Cannot modify warrantyMonths or stages of a sequence used by campaigns',
          },
        });
      }

      if (dto.stages !== undefined) {
        this.validateStages(dto.stages);
        this.assertCompleteStages(dto.stages);
      }
      if (dto.warrantyMonths !== undefined) {
        this.validateWarrantyMonths(dto.warrantyMonths);
      }

      const updateData: Prisma.FollowUpSequenceUpdateInput = {
        name: dto.name,
        description: dto.description,
        updatedBy: user.id,
      };

      if (dto.warrantyMonths !== undefined && campaignCount === 0) {
        updateData.warrantyMonths = dto.warrantyMonths;
      }

      if (dto.stages !== undefined && campaignCount === 0) {
        // Full replacement: soft-delete current stages, then create the new
        // set. Offset uniqueness was validated above while holding the row
        // lock, so no concurrent writer can interleave a colliding insert.
        await tx.followUpSequenceStage.updateMany({
          where: { sequenceId: sequence.id, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: user.id },
        });
        await tx.followUpSequenceStage.createMany({
          data: dto.stages.map((stage) => ({
            sequenceId: sequence.id,
            name: stage.name as string,
            offsetDays: stage.offsetDays as number,
            template: stage.template as string,
            createdBy: user.id,
          })),
        });
      }

      return tx.followUpSequence.update({
        where: { id: sequence.id },
        data: updateData,
      });
    });

    await this.auditService.record({
      module: MODULE,
      action: 'follow_up_sequence.update',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `follow up sequence updated seq=${updated.uuid}`,
      metadata: { sequenceId: updated.uuid },
    });

    return { uuid: updated.uuid, name: updated.name };
  }

  async remove(
    user: AuthUser,
    uuid: string,
  ): Promise<{ uuid: string; success: true }> {
    const organizationId = this.requireOrg(user);

    const removed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "follow_up_sequences" WHERE uuid = ${uuid} AND organization_id = ${organizationId} AND deleted_at IS NULL FOR UPDATE`;

      const sequence = await tx.followUpSequence.findFirst({
        where: { uuid, organizationId, deletedAt: null },
        select: { id: true, uuid: true },
      });
      if (!sequence) {
        throw this.sequenceNotFound();
      }

      // HG-FUS-02: prevent deletion while referenced by campaigns; checked in
      // the same transaction that performs the soft delete.
      const campaignCount = await tx.campaign.count({
        where: { followUpSequenceId: sequence.id, deletedAt: null },
      });
      if (campaignCount > 0) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot delete a sequence used by campaigns',
          },
        });
      }

      return tx.followUpSequence.update({
        where: { id: sequence.id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
    });

    await this.auditService.record({
      module: MODULE,
      action: 'follow_up_sequence.delete',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `follow up sequence deleted seq=${removed.uuid}`,
      metadata: { sequenceId: removed.uuid },
    });

    return { uuid: removed.uuid, success: true };
  }

  private requireOrg(user: AuthUser): string {
    if (user.accountType !== 'ORGANIZATION' || !user.organizationId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Organization scope required' },
      });
    }
    return user.organizationId;
  }

  private sequenceNotFound(): NotFoundException {
    return new NotFoundException({
      error: {
        code: 'FOLLOW_UP_SEQUENCE_NOT_FOUND',
        message: 'Sequence not found',
      },
    });
  }

  private validateStages(stages: ReadonlyArray<StageWriteInput>): void {
    if (!stages || stages.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one stage is required',
        },
      });
    }
    const seen = new Set<number>();
    for (const stage of stages) {
      if (stage.offsetDays === undefined || Number.isNaN(stage.offsetDays)) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Each stage requires offsetDays',
          },
        });
      }
      if (seen.has(stage.offsetDays)) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Duplicate offsetDays: ${stage.offsetDays}. Each stage must have a unique offset.`,
          },
        });
      }
      seen.add(stage.offsetDays);
    }
  }

  private assertCompleteStages(stages: ReadonlyArray<StageWriteInput>): void {
    for (const stage of stages) {
      if (!stage.name?.trim() || !stage.template?.trim()) {
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Each stage requires name and template',
          },
        });
      }
    }
  }

  private validateWarrantyMonths(months: number): void {
    if (!ALLOWED_WARRANTY_MONTHS.includes(months)) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'warrantyMonths must be one of: 12, 15, 18, 24',
        },
      });
    }
  }

  private buildSort(
    sort?: string,
  ): Prisma.FollowUpSequenceOrderByWithRelationInput | undefined {
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
}
