import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Customer, CustomerStatus, Prisma } from '@prisma/client';
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

export interface CustomerTimeline {
  customer: { uuid: string; name: string; status: string };
  purchases: Array<{
    uuid: string;
    invoiceNumber: string;
    purchaseDate: string;
    quantity: number;
    value: number;
    warrantyMonths: number | null;
    warrantyExpiresAt: string | null;
    status: string;
    product: { uuid: string; name: string; code: string };
    automations: Array<{
      uuid: string;
      stageName: string | null;
      scheduledDate: string;
      executedDate: string | null;
      status: string;
      purpose: string;
      messagePreview: string | null;
    }>;
  }>;
  quotes: Array<{
    uuid: string;
    value: number;
    status: string;
    createdAt: string;
    sentAt: string | null;
  }>;
  conversations: Array<{
    uuid: string;
    channel: string;
    status: string;
    messageCount: number;
    createdAt: string;
  }>;
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

    // P0.1: cliente recurrente = con 2+ compras (se resuelve por groupBy porque
    // Prisma no filtra por conteo de relación dentro de where).
    if (query.recurrent === 'true') {
      const groups = await this.prisma.purchase.groupBy({
        by: ['customerId'],
        where: {
          deletedAt: null,
          organizationId: user.organizationId ?? undefined,
        },
        _count: { _all: true },
      });
      where.id = {
        in: groups
          .filter((group) => group._count._all >= 2)
          .map((group) => group.customerId),
      };
    }

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

    // Decisión 4: any authenticated role may complete a PENDING contact
    // (auto-created from an inbound WhatsApp message). Editing master data
    // (ACTIVE/INACTIVE/BLOCKED customers) stays restricted to
    // PLATFORM_OWNER / ADMINISTRADOR / GERENTE.
    const isPrivileged =
      user.accountType === 'PLATFORM' ||
      user.role === 'ADMINISTRADOR' ||
      user.role === 'GERENTE';
    if (customer.status !== CustomerStatus.PENDING && !isPrivileged) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'Only PENDING contacts can be edited by this role. Contact an administrator to edit this customer.',
        },
      });
    }

    // The enrichment transition is controlled: a PENDING contact can only
    // become ACTIVE (or stay PENDING). OPERADOR cannot block/inactivate it.
    if (
      !isPrivileged &&
      dto.status !== undefined &&
      dto.status !== CustomerStatus.ACTIVE
    ) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'A PENDING contact can only be transitioned to ACTIVE. Blocking or inactivating requires an administrator.',
        },
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

  // Fase 5 (T19): opt-out "No contactar" (playbook §15). Detiene envíos
  // comerciales/automatizaciones (scheduler y campañas respetan noContactAt).
  async noContact(
    user: AuthUser,
    id: string,
    reason?: string,
  ): Promise<Customer> {
    const customer = await this.findScoped(user, id);
    if (!customer) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        noContactAt: new Date(),
        noContactReason: reason?.trim() || null,
        updatedBy: user.id,
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'customer.no_contact',
      outcome: 'success',
      userId: user.id,
      organizationId: customer.organizationId,
      description: `customer opted out of contact codcli=${customer.codcli}`,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }

  async allowContact(user: AuthUser, id: string): Promise<Customer> {
    const customer = await this.findScoped(user, id);
    if (!customer) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { noContactAt: null, noContactReason: null, updatedBy: user.id },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'customer.allow_contact',
      outcome: 'success',
      userId: user.id,
      organizationId: customer.organizationId,
      description: `customer re-enabled contact codcli=${customer.codcli}`,
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

  // ---------------------------------------------------------------------------
  // Timeline (Customer 360)
  // ---------------------------------------------------------------------------

  async findTimeline(
    user: AuthUser,
    id: string,
  ): Promise<CustomerTimeline | null> {
    const customer = await this.findScoped(user, id);
    if (!customer) return null;

    const organizationId = user.organizationId ?? undefined;

    const purchases = await this.prisma.purchase.findMany({
      where: {
        customerId: customer.id,
        organizationId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
      },
      include: {
        product: { select: { uuid: true, name: true, code: true } },
        automations: {
          where: { deletedAt: null },
          orderBy: { scheduledDate: 'asc' },
          include: {
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { content: true, status: true, sentAt: true },
            },
          },
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });

    const quotes = await this.prisma.quote.findMany({
      where: {
        customerId: customer.id,
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversations = await this.prisma.conversation.findMany({
      where: {
        customerId: customer.id,
        organizationId,
        deletedAt: null,
      },
      include: {
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      customer: {
        uuid: customer.uuid,
        name: customer.name,
        status: customer.status,
      },
      purchases: purchases.map((p) => ({
        uuid: p.uuid,
        invoiceNumber: p.invoiceNumber,
        purchaseDate: p.purchaseDate.toISOString(),
        quantity: p.quantity,
        value: Number(p.value),
        warrantyMonths: p.warrantyMonths,
        warrantyExpiresAt: p.warrantyExpiresAt?.toISOString() ?? null,
        status: p.status,
        product: p.product,
        automations: p.automations.map((a) => ({
          uuid: a.uuid,
          stageName: a.stageName ?? null,
          scheduledDate: a.scheduledDate.toISOString(),
          executedDate: a.executedDate?.toISOString() ?? null,
          status: a.status,
          purpose: a.purpose,
          messagePreview:
            a.messages[0]?.content ?? a.messageTemplate ?? null,
        })),
      })),
      quotes: quotes.map((q) => ({
        uuid: q.uuid,
        value: Number(q.value),
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        sentAt: q.sentAt?.toISOString() ?? null,
      })),
      conversations: conversations.map((c) => ({
        uuid: c.uuid,
        channel: c.channel,
        status: c.status,
        messageCount: c._count.messages,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  private findScoped(
    user: AuthUser,
    identifier: string,
  ): Promise<Customer | null> {
    const scopedWhere: Prisma.CustomerWhereInput = {
      OR: [{ id: identifier }, { uuid: identifier }],
      deletedAt: null,
    };
    if (user.accountType === 'ORGANIZATION') {
      return this.prisma.customer.findFirst({
        where: {
          ...scopedWhere,
          organizationId: user.organizationId ?? undefined,
        },
      });
    }
    return this.prisma.customer.findFirst({
      where: scopedWhere,
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
    // P0.1: filtros de drill-down comercial (garantías, compras, contacto).
    if (query.warrantyExpiringInDays) {
      const now = new Date();
      const until = new Date(
        now.getTime() + query.warrantyExpiringInDays * 86_400_000,
      );
      where.purchases = {
        some: {
          deletedAt: null,
          warrantyExpiresAt: { gte: now, lte: until },
        },
      };
    }
    if (query.warrantyExpiredInDays) {
      const now = new Date();
      const since = new Date(
        now.getTime() - query.warrantyExpiredInDays * 86_400_000,
      );
      where.purchases = {
        some: {
          deletedAt: null,
          warrantyExpiresAt: { gte: since, lte: now },
        },
      };
    }
    if (query.hasPurchases === 'true') {
      where.purchases = { some: { deletedAt: null } };
    }
    if (query.hasPurchases === 'false') {
      where.purchases = { none: { deletedAt: null } };
    }
    if (query.noContact === 'true') {
      where.noContactAt = { not: null };
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
