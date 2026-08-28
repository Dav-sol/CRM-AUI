import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, Template } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';

export interface TemplateItem {
  id: string;
  uuid: string;
  organizationId: string;
  code: string | null;
  name: string;
  group: string | null;
  category: Template['category'];
  tone: Template['tone'];
  angle: Template['angle'];
  goal: string | null;
  recommendedUse: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateListResult {
  data: TemplateItem[];
  meta: { page: number; limit: number; total: number; pages: number };
}

function toTemplateItem(template: Template): TemplateItem {
  return {
    id: template.id,
    uuid: template.uuid,
    organizationId: template.organizationId,
    code: template.code,
    name: template.name,
    group: template.group,
    category: template.category,
    tone: template.tone,
    angle: template.angle,
    goal: template.goal,
    recommendedUse: template.recommendedUse,
    body: template.body,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

const SORT_FIELDS = new Set([
  'code',
  'name',
  'group',
  'category',
  'tone',
  'angle',
  'createdAt',
  'updatedAt',
]);

const MODULE = 'templates';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async findAll(user: AuthUser, query: QueryTemplatesDto): Promise<TemplateListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(user, query);

    const [total, templates] = await Promise.all([
      this.prisma.template.count({ where }),
      this.prisma.template.findMany({
        where,
        orderBy: this.buildSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: templates.map(toTemplateItem),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(user: AuthUser, uuid: string): Promise<TemplateItem | null> {
    const template = await this.prisma.template.findFirst({
      where: { uuid, organizationId: this.requireOrg(user), deletedAt: null },
    });
    return template ? toTemplateItem(template) : null;
  }

  async create(
    user: AuthUser,
    dto: CreateTemplateDto,
  ): Promise<TemplateItem> {
    const organizationId = this.requireOrg(user);
    const created = await this.prisma.template.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
        group: dto.group,
        category: dto.category,
        tone: dto.tone,
        angle: dto.angle,
        goal: dto.goal,
        recommendedUse: dto.recommendedUse,
        body: dto.body,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'template.create',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `template created template=${created.uuid}`,
      metadata: { templateId: created.uuid },
    });

    return toTemplateItem(created);
  }

  async update(
    user: AuthUser,
    uuid: string,
    dto: UpdateTemplateDto,
  ): Promise<TemplateItem> {
    const organizationId = this.requireOrg(user);
    const existing = await this.prisma.template.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
    if (!existing) {
      throw new BadRequestException({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    const hasChanges = Object.values(dto).some((v) => v !== undefined);
    if (!hasChanges) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one field must be provided',
        },
      });
    }

    // Las plantillas sembradas de la biblioteca no cambian de código.
    const updated = await this.prisma.template.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        group: dto.group,
        category: dto.category,
        tone: dto.tone,
        angle: dto.angle,
        goal: dto.goal,
        recommendedUse: dto.recommendedUse,
        body: dto.body,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'template.update',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `template updated template=${updated.uuid}`,
      metadata: { templateId: updated.uuid },
    });

    return toTemplateItem(updated);
  }

  async remove(user: AuthUser, uuid: string): Promise<void> {
    const organizationId = this.requireOrg(user);
    const existing = await this.prisma.template.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
    if (!existing) {
      throw new BadRequestException({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    await this.prisma.template.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'template.delete',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `template deleted template=${existing.uuid}`,
      metadata: { templateId: existing.uuid },
    });
  }

  private buildListWhere(
    user: AuthUser,
    query: QueryTemplatesDto,
  ): Prisma.TemplateWhereInput {
    const where: Prisma.TemplateWhereInput = {
      organizationId: this.requireOrg(user),
      deletedAt: null,
    };

    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { goal: { contains: query.search.trim(), mode: 'insensitive' } },
        { recommendedUse: { contains: query.search.trim(), mode: 'insensitive' } },
        { body: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.tone) {
      where.tone = query.tone;
    }
    if (query.angle) {
      where.angle = query.angle;
    }
    if (query.group?.trim()) {
      where.group = query.group.trim();
    }
    return where;
  }

  private buildSort(sort?: string): Prisma.TemplateOrderByWithRelationInput[] {
    if (!sort) {
      return [{ code: 'asc' }, { name: 'asc' }];
    }
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: `Invalid sort field: ${field}` },
      });
    }
    return [{ [field]: desc ? 'desc' : 'asc' }];
  }

  private requireOrg(user: AuthUser): string {
    if (!user.organizationId) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization context required',
        },
      });
    }
    return user.organizationId;
  }
}
