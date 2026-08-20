import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { Import, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateImportDto } from './dto/create-import.dto';
import { QueryImportsDto } from './dto/query-imports.dto';
import { ACTIVE_IMPORT_STATUSES, UPLOADS_DIR } from './imports.constants';
import { FileValidatorService } from './file-validator.service';
import { ImportsProcessor } from './imports.processor';

const MODULE = 'imports';

const SORT_FIELDS = new Set(['type', 'status', 'createdAt', 'updatedAt']);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ImportListResult {
  data: ImportSummary[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface ImportSummary {
  uuid: string;
  type: Import['type'];
  status: Import['status'];
  fileName: string;
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  errorsSummary: {
    total: number;
    samples: { row: number; field: string; message: string; raw?: string }[];
  };
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ERRORS_SAMPLE_COUNT = 10;

function toSummary(job: Import): ImportSummary {
  const samples =
    (
      job.errors as {
        rows?: { row: number; field: string; message: string; raw?: string }[];
      } | null
    )?.rows ?? [];
  return {
    uuid: job.uuid,
    type: job.type,
    status: job.status,
    fileName: job.fileName,
    totalRecords: job.totalRecords,
    processedRecords: job.processedRecords,
    errorRecords: job.errorRecords,
    errorsSummary: {
      total: job.errorRecords,
      samples: samples.slice(0, ERRORS_SAMPLE_COUNT),
    },
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly fileValidator: FileValidatorService,
    private readonly processor: ImportsProcessor,
  ) {}

  async create(
    user: AuthUser,
    dto: CreateImportDto,
    file: Express.Multer.File,
    idempotencyKey?: string,
  ): Promise<{ job: ImportSummary; created: boolean }> {
    const organizationId = await this.resolveOrganizationId(user, dto);

    if (!file) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'missing_file' },
      });
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'file is required' },
      });
    }

    let format: 'xlsx' | 'csv';
    try {
      format = this.fileValidator.validateFormat(file);
    } catch (error) {
      if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
        throw new PayloadTooLargeException({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'File exceeds the maximum size of 25 MB',
          },
        });
      }
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'unsupported_media' },
      });
      throw new UnsupportedMediaTypeException({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'only XLSX and CSV files are supported',
        },
      });
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    if (idempotencyKey) {
      const replayed = await this.prisma.import.findFirst({
        where: { organizationId, userId: user.id, idempotencyKey },
      });
      if (replayed) {
        return { job: toSummary(replayed), created: false };
      }
    }

    const duplicate = await this.prisma.import.findFirst({
      where: { organizationId, fileHash },
    });
    if (duplicate) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'duplicate_file' },
      });
      throw new ConflictException({
        error: {
          code: 'DUPLICATE_FILE',
          message: 'This file has already been imported',
        },
      });
    }

    const active = await this.prisma.import.count({
      where: {
        organizationId,
        type: dto.type,
        status: { in: ACTIVE_IMPORT_STATUSES },
      },
    });
    if (active > 0) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'active_job_conflict', type: dto.type },
      });
      throw new ConflictException({
        error: {
          code: 'IMPORT_ACTIVE',
          message: `An import of type ${dto.type} is already active`,
        },
      });
    }

    const storageUuid = randomUUID();
    const fileName = basename(file.originalname ?? '');
    const filePath = `${UPLOADS_DIR}/org-${organizationId}/${storageUuid}.${format}`;
    await mkdir(
      resolve(process.cwd(), `${UPLOADS_DIR}/org-${organizationId}`),
      {
        recursive: true,
      },
    );
    await writeFile(resolve(process.cwd(), filePath), file.buffer);

    let job: Import;
    try {
      job = await this.prisma.import.create({
        data: {
          organizationId,
          userId: user.id,
          type: dto.type,
          fileName,
          filePath,
          fileHash,
          idempotencyKey: idempotencyKey ?? null,
          status: 'PENDING',
          createdBy: user.id,
        },
      });
    } catch (error) {
      await unlink(resolve(process.cwd(), filePath)).catch(() => undefined);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        if (idempotencyKey) {
          const replayed = await this.prisma.import.findFirst({
            where: { organizationId, userId: user.id, idempotencyKey },
          });
          if (replayed) {
            return { job: toSummary(replayed), created: false };
          }
        }
        const duplicate = await this.prisma.import.findFirst({
          where: { organizationId, fileHash },
        });
        if (duplicate) {
          await this.auditService.record({
            module: MODULE,
            action: 'import.create',
            outcome: 'failure',
            userId: user.id,
            organizationId,
            metadata: { reason: 'duplicate_file' },
          });
          throw new ConflictException({
            error: {
              code: 'DUPLICATE_FILE',
              message: 'This file has already been imported',
            },
          });
        }
      }
      throw error;
    }

    await this.auditService.record({
      module: MODULE,
      action: 'import.create',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `import created type=${job.type} file=${fileName}`,
    });

    void this.processor.process(job);

    return { job: toSummary(job), created: true };
  }

  async findAll(
    user: AuthUser,
    query: QueryImportsDto,
  ): Promise<ImportListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(user, query);

    const [total, jobs] = await Promise.all([
      this.prisma.import.count({ where }),
      this.prisma.import.findMany({
        where,
        orderBy: this.buildSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: jobs.map(toSummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(user: AuthUser, uuid: string): Promise<ImportSummary | null> {
    const job = await this.findScoped(user, uuid);
    return job ? toSummary(job) : null;
  }

  async cancel(user: AuthUser, uuid: string): Promise<Import> {
    const job = await this.findScoped(user, uuid);
    if (!job) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.cancel',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'IMPORT_NOT_FOUND', message: 'Import job not found' },
      });
    }

    if (!ACTIVE_IMPORT_STATUSES.includes(job.status)) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Cannot cancel an import in status ${job.status}`,
        },
      });
    }

    await this.prisma.import.update({
      where: { id: job.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        updatedBy: user.id,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.cancel',
      outcome: 'success',
      userId: user.id,
      organizationId: job.organizationId,
      description: `import cancelled uuid=${job.uuid}`,
    });

    return job;
  }

  async retry(user: AuthUser, uuid: string): Promise<Import> {
    const job = await this.findScoped(user, uuid);
    if (!job) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.retry',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'IMPORT_NOT_FOUND', message: 'Import job not found' },
      });
    }

    if (job.status !== 'FAILED' && job.status !== 'PARTIAL') {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Cannot retry an import in status ${job.status}`,
        },
      });
    }

    const active = await this.prisma.import.count({
      where: {
        organizationId: job.organizationId,
        type: job.type,
        status: { in: ACTIVE_IMPORT_STATUSES },
        id: { not: job.id },
      },
    });
    if (active > 0) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.retry',
        outcome: 'failure',
        userId: user.id,
        organizationId: job.organizationId,
        metadata: { reason: 'active_job_conflict', type: job.type },
      });
      throw new ConflictException({
        error: {
          code: 'IMPORT_ACTIVE',
          message: `An import of type ${job.type} is already active`,
        },
      });
    }

    const isStructuralRetry = job.status === 'FAILED';
    const retryRows = isStructuralRetry
      ? undefined
      : new Set(
          ((job.errors as { rows?: { row: number }[] } | null)?.rows ?? [])
            .map((entry) => entry.row)
            .filter((row): row is number => typeof row === 'number'),
        );

    const updated = await this.prisma.import.update({
      where: { id: job.id },
      data: {
        status: isStructuralRetry ? 'PENDING' : 'PROCESSING',
        startedAt: new Date(),
        completedAt: null,
        processedRecords: 0,
        errorRecords: 0,
        updatedBy: user.id,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.retry',
      outcome: 'success',
      userId: user.id,
      organizationId: job.organizationId,
      description: `import retried uuid=${job.uuid} rows=${retryRows?.size ?? 'all'}`,
    });

    void this.processor.process(updated, retryRows);

    return updated;
  }

  async purgeExpiredFiles(days: number): Promise<number> {
    return this.processor.purgeExpiredFiles(days);
  }

  private findScoped(user: AuthUser, uuid: string): Promise<Import | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.import.findFirst({
        where: {
          uuid,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
      });
    }
    return this.prisma.import.findFirst({
      where: { uuid, deletedAt: null },
    });
  }

  private buildListWhere(
    user: AuthUser,
    query: QueryImportsDto,
  ): Prisma.ImportWhereInput {
    const where: Prisma.ImportWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.search) {
      where.fileName = { contains: query.search, mode: 'insensitive' };
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
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

  private resolveDateBoundary(value: string, upper: boolean): Date {
    if (DATE_ONLY_PATTERN.test(value)) {
      return upper
        ? new Date(`${value}T23:59:59.999Z`)
        : new Date(`${value}T00:00:00.000Z`);
    }
    return new Date(value);
  }

  private buildSort(sort?: string): Prisma.ImportOrderByWithRelationInput[] {
    const field = (sort ?? '-createdAt').replace(/^-/, '');
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? '-createdAt').startsWith('-') ? 'desc' : 'asc';
    return [{ [field]: direction }] as Prisma.ImportOrderByWithRelationInput[];
  }

  private async resolveOrganizationId(
    user: AuthUser,
    dto: CreateImportDto,
  ): Promise<string> {
    if (user.accountType === 'ORGANIZATION') {
      if (dto.organizationId) {
        await this.auditService.record({
          module: MODULE,
          action: 'import.create',
          outcome: 'failure',
          userId: user.id,
          organizationId: user.organizationId,
          metadata: { reason: 'tenant_from_client' },
        });
        throw new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'organizationId is not allowed for organization users',
          },
        });
      }
      return user.organizationId as string;
    }

    if (!dto.organizationId) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId: null,
        metadata: { reason: 'missing_organization' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'organizationId is required for PLATFORM_OWNER',
        },
      });
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!organization) {
      await this.auditService.record({
        module: MODULE,
        action: 'import.create',
        outcome: 'failure',
        userId: user.id,
        organizationId: dto.organizationId,
        metadata: { reason: 'unknown_organization' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization not found',
        },
      });
    }
    return dto.organizationId;
  }
}
