import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';
import { QueryPurchaseStatsDto } from './dto/query-purchase-stats.dto';

export interface PurchaseListItem {
  id: string;
  uuid: string;
  organizationId: string;
  customerId: string;
  productId: string;
  invoiceNumber: string;
  purchaseDate: Date;
  warrantyMonths: number | null;
  warrantyExpiresAt: Date | null;
  quantity: number;
  value: Prisma.Decimal;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  customer: { id: string; codcli: string; name: string };
  product: { id: string; code: string; name: string };
}

export interface PurchaseListResult {
  data: PurchaseListItem[];
  meta: { page: number; limit: number; total: number; pages: number };
}

const SORT_FIELDS = new Set([
  'purchaseDate',
  'invoiceNumber',
  'quantity',
  'value',
  'status',
  'createdAt',
  'updatedAt',
]);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MODULE = 'purchases';

const CUSTOMER_PRODUCT_SELECT = {
  customer: { select: { id: true, codcli: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
} as const;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async findAll(
    user: AuthUser,
    query: QueryPurchasesDto,
  ): Promise<PurchaseListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(user, query);

    const [total, purchases] = await Promise.all([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        orderBy: this.buildSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        include: CUSTOMER_PRODUCT_SELECT,
      }),
    ]);

    return {
      data: purchases,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(user: AuthUser, id: string): Promise<PurchaseListItem | null> {
    return this.findScoped(user, id);
  }

  async create(
    user: AuthUser,
    dto: CreatePurchaseDto,
  ): Promise<PurchaseListItem> {
    const organizationId = await this.resolveOrganizationId(user, dto);
    const purchaseDate = new Date(dto.purchaseDate);

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) {
      await this.auditService.record({
        module: MODULE,
        action: 'purchase.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'invalid_customer' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Customer not found in this organization',
        },
      });
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId, deletedAt: null },
      select: { id: true, warrantyMonths: true },
    });
    if (!product) {
      await this.auditService.record({
        module: MODULE,
        action: 'purchase.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'invalid_product' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Product not found in this organization',
        },
      });
    }

    const existing = await this.prisma.purchase.findFirst({
      where: {
        organizationId,
        invoiceNumber: dto.invoiceNumber,
        customerId: dto.customerId,
        productId: dto.productId,
        purchaseDate,
      },
    });

    const warrantyMonths = dto.warrantyMonths ?? product.warrantyMonths ?? null;
    const warrantyExpiresAt = warrantyMonths
      ? addMonths(purchaseDate, warrantyMonths)
      : null;

    if (existing) {
      await this.auditService.record({
        module: MODULE,
        action: 'purchase.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'duplicate_purchase' },
      });
      throw new ConflictException({
        error: {
          code: 'CONFLICT',
          message: 'A purchase with this invoiceNumber already exists',
        },
      });
    }

    try {
      const purchase = await this.prisma.purchase.create({
        data: {
          organizationId,
          customerId: dto.customerId,
          productId: dto.productId,
          invoiceNumber: dto.invoiceNumber,
          purchaseDate,
          warrantyMonths,
          warrantyExpiresAt,
          quantity: dto.quantity,
          value: new Prisma.Decimal(dto.value),
          status: dto.status ?? undefined,
          createdBy: user.id,
        },
        include: CUSTOMER_PRODUCT_SELECT,
      });
      await this.auditService.record({
        module: MODULE,
        action: 'purchase.create',
        outcome: 'success',
        userId: user.id,
        organizationId,
        description: `purchase created invoice=${purchase.invoiceNumber}`,
      });
      return purchase;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.auditService.record({
          module: MODULE,
          action: 'purchase.create',
          outcome: 'failure',
          userId: user.id,
          organizationId,
          metadata: { reason: 'duplicate_purchase' },
        });
        throw new ConflictException({
          error: {
            code: 'CONFLICT',
            message: 'A purchase with this invoiceNumber already exists',
          },
        });
      }
      throw error;
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdatePurchaseDto,
  ): Promise<PurchaseListItem> {
    const purchase = await this.findScoped(user, id);
    if (!purchase) {
      await this.auditService.record({
        module: MODULE,
        action: 'purchase.update',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' },
      });
    }

    let warrantyMonths: number | null | undefined = undefined;
    let warrantyExpiresAt: Date | null | undefined = undefined;

    if (dto.warrantyMonths !== undefined) {
      warrantyMonths = dto.warrantyMonths;
    } else if (dto.purchaseDate) {
      const product = await this.prisma.product.findUnique({
        where: { id: purchase.productId },
        select: { warrantyMonths: true },
      });
      warrantyMonths =
        product?.warrantyMonths ?? purchase.warrantyMonths ?? null;
    }

    if (dto.purchaseDate || dto.warrantyMonths !== undefined) {
      const newPurchaseDate = dto.purchaseDate
        ? new Date(dto.purchaseDate)
        : purchase.purchaseDate;
      const months = warrantyMonths ?? purchase.warrantyMonths ?? null;
      warrantyExpiresAt = months ? addMonths(newPurchaseDate, months) : null;
    }

    const updated = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyMonths,
        warrantyExpiresAt,
        quantity: dto.quantity ?? undefined,
        value: dto.value ? new Prisma.Decimal(dto.value) : undefined,
        status: dto.status ?? undefined,
        updatedBy: user.id,
      },
      include: CUSTOMER_PRODUCT_SELECT,
    });

    await this.auditService.record({
      module: MODULE,
      action: 'purchase.update',
      outcome: 'success',
      userId: user.id,
      organizationId: purchase.organizationId,
      description: `purchase updated invoice=${purchase.invoiceNumber}`,
    });
    return updated;
  }

  async stats(
    user: AuthUser,
    query: QueryPurchaseStatsDto,
  ): Promise<{
    total: number;
    totalValue: Prisma.Decimal;
    units: number;
    activeWarranties: number;
    customers: number;
  }> {
    const where: Prisma.PurchaseWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      where.purchaseDate = {};
      if (query.dateFrom) {
        where.purchaseDate.gte = this.resolveDateBoundary(
          query.dateFrom,
          false,
        );
      }
      if (query.dateTo) {
        where.purchaseDate.lte = this.resolveDateBoundary(query.dateTo, true);
      }
    }

    const [agg, activeWarranties, customers] = await Promise.all([
      this.prisma.purchase.aggregate({
        where,
        _count: { _all: true },
        _sum: { value: true, quantity: true },
      }),
      this.prisma.purchase.count({
        where: { ...where, warrantyExpiresAt: { gte: new Date() } },
      }),
      this.prisma.purchase.findMany({
        where,
        distinct: ['customerId'],
        select: { customerId: true },
      }),
    ]);

    return {
      total: agg._count._all,
      totalValue: agg._sum.value ?? new Prisma.Decimal(0),
      units: agg._sum.quantity ?? 0,
      activeWarranties,
      customers: customers.length,
    };
  }

  private findScoped(
    user: AuthUser,
    id: string,
  ): Promise<PurchaseListItem | null> {
    const where: Prisma.PurchaseWhereInput = { id, deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }
    return this.prisma.purchase.findFirst({
      where,
      include: CUSTOMER_PRODUCT_SELECT,
    });
  }

  private buildListWhere(
    user: AuthUser,
    query: QueryPurchasesDto,
  ): Prisma.PurchaseWhereInput {
    const where: Prisma.PurchaseWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.search) {
      where.invoiceNumber = {
        contains: query.search,
        mode: 'insensitive',
      };
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      where.purchaseDate = {};
      if (query.dateFrom) {
        where.purchaseDate.gte = this.resolveDateBoundary(
          query.dateFrom,
          false,
        );
      }
      if (query.dateTo) {
        where.purchaseDate.lte = this.resolveDateBoundary(query.dateTo, true);
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

  private buildSort(sort?: string): Prisma.PurchaseOrderByWithRelationInput[] {
    const field = (sort ?? '-purchaseDate').replace(/^-/, '');
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? '-purchaseDate').startsWith('-')
      ? 'desc'
      : 'asc';
    return [
      { [field]: direction },
    ] as Prisma.PurchaseOrderByWithRelationInput[];
  }

  private async resolveOrganizationId(
    user: AuthUser,
    dto: CreatePurchaseDto,
  ): Promise<string> {
    if (user.accountType === 'ORGANIZATION') {
      if (dto.organizationId) {
        await this.auditService.record({
          module: MODULE,
          action: 'purchase.create',
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
        action: 'purchase.create',
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
        action: 'purchase.create',
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
