import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';

export interface CustomerListResult {
  data: Customer[];
  meta: { page: number; limit: number; total: number; pages: number };
}

const SORT_FIELDS = new Set([
  'name',
  'codcli',
  'city',
  'status',
  'createdAt',
  'updatedAt',
]);

const MODULE = 'customers';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async findAll(
    user: AuthUser,
    query: QueryCustomersDto,
  ): Promise<CustomerListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildListWhere(user, query);

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: this.buildSort(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: customers,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(user: AuthUser, id: string): Promise<Customer | null> {
    return this.findScoped(user, id);
  }

  async create(user: AuthUser, dto: CreateCustomerDto): Promise<Customer> {
    const organizationId = await this.resolveOrganizationId(user, dto);

    const existing = await this.prisma.customer.findFirst({
      where: { organizationId, codcli: dto.codcli, deletedAt: null },
    });
    if (existing) {
      await this.auditService.record({
        module: MODULE,
        action: 'customer.create',
        outcome: 'failure',
        userId: user.id,
        organizationId,
        metadata: { reason: 'duplicate_codcli' },
      });
      throw new ConflictException({
        error: {
          code: 'CONFLICT',
          message: 'A customer with this codcli already exists',
        },
      });
    }

    try {
      const customer = await this.prisma.customer.create({
        data: {
          organizationId,
          codcli: dto.codcli,
          name: dto.name,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          createdBy: user.id,
        },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'customer.create',
        outcome: 'success',
        userId: user.id,
        organizationId,
        description: `customer created codcli=${customer.codcli}`,
      });
      return customer;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.auditService.record({
          module: MODULE,
          action: 'customer.create',
          outcome: 'failure',
          userId: user.id,
          organizationId,
          metadata: { reason: 'duplicate_codcli' },
        });
        throw new ConflictException({
          error: {
            code: 'CONFLICT',
            message: 'A customer with this codcli already exists',
          },
        });
      }
      throw error;
    }
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findScoped(user, id);
    if (!customer) {
      await this.auditService.record({
        module: MODULE,
        action: 'customer.update',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }

    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: dto.name ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        address: dto.address ?? undefined,
        city: dto.city ?? undefined,
        status: dto.status ?? undefined,
        updatedBy: user.id,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'customer.update',
      outcome: 'success',
      userId: user.id,
      organizationId: customer.organizationId,
      description: `customer updated codcli=${customer.codcli}`,
    });
    return updated;
  }

  async remove(user: AuthUser, id: string): Promise<Customer> {
    const customer = await this.findScoped(user, id);
    if (!customer) {
      await this.auditService.record({
        module: MODULE,
        action: 'customer.delete',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { reason: 'not_found' },
      });
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }

    const deleted = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date(), deletedBy: user.id },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'customer.delete',
      outcome: 'success',
      userId: user.id,
      organizationId: customer.organizationId,
      description: `customer soft-deleted codcli=${customer.codcli}`,
    });
    return deleted;
  }

  private findScoped(user: AuthUser, id: string): Promise<Customer | null> {
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.customer.findFirst({
        where: {
          id,
          organizationId: user.organizationId ?? undefined,
          deletedAt: null,
        },
      });
    }
    return this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
  }

  private buildListWhere(
    user: AuthUser,
    query: QueryCustomersDto,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (user.accountType === 'ORGANIZATION') {
      where.organizationId = user.organizationId ?? undefined;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { codcli: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        where.createdAt.lte = new Date(query.createdTo);
      }
    }
    return where;
  }

  private buildSort(sort?: string): Prisma.CustomerOrderByWithRelationInput[] {
    const field = (sort ?? '-createdAt').replace(/^-/, '');
    if (!SORT_FIELDS.has(field)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const direction = (sort ?? '-createdAt').startsWith('-') ? 'desc' : 'asc';
    return [
      { [field]: direction },
    ] as Prisma.CustomerOrderByWithRelationInput[];
  }

  private async resolveOrganizationId(
    user: AuthUser,
    dto: CreateCustomerDto,
  ): Promise<string> {
    if (user.accountType === 'ORGANIZATION') {
      if (dto.organizationId) {
        await this.auditService.record({
          module: MODULE,
          action: 'customer.create',
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
        action: 'customer.create',
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
        action: 'customer.create',
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
