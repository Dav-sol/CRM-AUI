import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Product, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

export interface ProductListResult {
  data: ProductItem[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface ProductItem {
  id: string;
  uuid: string;
  organizationId: string;
  code: string;
  name: string;
  category: string | null;
  status: Product['status'];
  warrantyMonths: number | null;
  price: number | null;
  // Actor audit fields (specs/014-products-v1/contracts/products-api.md: the
  // create/update responses carry createdBy/updatedBy).
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toProductItem(product: Product): ProductItem {
  return {
    id: product.id,
    uuid: product.uuid,
    organizationId: product.organizationId,
    code: product.code,
    name: product.name,
    category: product.category,
    status: product.status,
    warrantyMonths: product.warrantyMonths,
    price: product.price ? product.price.toNumber() : null,
    createdBy: product.createdBy,
    updatedBy: product.updatedBy,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

const SORT_FIELDS = new Set([
  'code',
  'name',
  'category',
  'status',
  'createdAt',
  'updatedAt',
]);

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MODULE = 'products';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async findAll(
    user: AuthUser,
    query: QueryProductsDto,
  ): Promise<ProductListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(user, query);

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: this.buildSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: products.map(toProductItem),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(user: AuthUser, id: string): Promise<ProductItem | null> {
    const product = await this.findScoped(user, id);
    return product ? toProductItem(product) : null;
  }

  async create(user: AuthUser, dto: CreateProductDto): Promise<ProductItem> {
    const organizationId = await this.resolveOrganizationId(user, dto);

    const existing = await this.prisma.product.findFirst({
      where: { organizationId, code: dto.code },
    });
    if (existing) {
      await this.auditService.record({
        module: MODULE,
        action: 'product.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'duplicate_code' },
      });
      throw new ConflictException({
        error: {
          code: 'CONFLICT',
          message: 'A product with this code already exists',
        },
      });
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          organizationId,
          code: dto.code,
          name: dto.name,
          category: dto.category ?? null,
          warrantyMonths: dto.warrantyMonths,
          price:
            dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
          status: dto.status ?? undefined,
          createdBy: user.id,
        },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'product.create',
        outcome: 'success',
        userId: user.id,
        organizationId,
        description: `product created code=${product.code}`,
      });
      return toProductItem(product);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.auditService.record({
          module: MODULE,
          action: 'product.create',
          outcome: 'failure',
          userId: user.id,
          organizationId,
          metadata: { reason: 'duplicate_code' },
        });
        throw new ConflictException({
          error: {
            code: 'CONFLICT',
            message: 'A product with this code already exists',
          },
        });
      }
      throw error;
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductItem> {
    const product = await this.findScoped(user, id);
    if (!product) {
      await this.auditService.record({
        module: MODULE,
        action: 'product.update',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' },
      });
    }

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        name: dto.name ?? undefined,
        category: dto.category ?? undefined,
        warrantyMonths: dto.warrantyMonths ?? undefined,
        price:
          dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        status: dto.status ?? undefined,
        updatedBy: user.id,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'product.update',
      outcome: 'success',
      userId: user.id,
      organizationId: product.organizationId,
      description: `product updated code=${product.code}`,
    });
    return toProductItem(updated);
  }

  async remove(user: AuthUser, id: string): Promise<Product> {
    const product = await this.findScoped(user, id);
    if (!product) {
      await this.auditService.record({
        module: MODULE,
        action: 'product.delete',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' },
      });
    }

    const deleted = await this.prisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'product.delete',
      outcome: 'success',
      userId: user.id,
      organizationId: product.organizationId,
      description: `product soft-deleted code=${product.code}`,
    });
    return deleted;
  }

  private findScoped(user: AuthUser, id: string): Promise<Product | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.product.findFirst({
        where: {
          id,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
      });
    }
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
  }

  private buildListWhere(
    user: AuthUser,
    query: QueryProductsDto,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.category) {
      where.category = query.category;
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

  private buildSort(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
    const field = (sort ?? '-createdAt').replace(/^-/, '');
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? '-createdAt').startsWith('-') ? 'desc' : 'asc';
    return [{ [field]: direction }] as Prisma.ProductOrderByWithRelationInput[];
  }

  private async resolveOrganizationId(
    user: AuthUser,
    dto: CreateProductDto,
  ): Promise<string> {
    if (user.accountType === 'ORGANIZATION') {
      if (dto.organizationId) {
        await this.auditService.record({
          module: MODULE,
          action: 'product.create',
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
        action: 'product.create',
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
        action: 'product.create',
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
