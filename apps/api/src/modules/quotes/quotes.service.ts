import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';

const MODULE = 'quotes';

export interface QuoteSummary {
  uuid: string;
  status: QuoteStatus;
  customerId: string | null;
  customerName: string;
  conversationId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number;
  value: number;
  note: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  purchaseId: string | null;
  createdAt: string;
}

interface QuoteRow {
  id: string;
  uuid: string;
  organizationId: string;
  conversationId: string | null;
  customerId: string | null;
  campaignId: string | null;
  productId: string | null;
  quantity: number;
  value: Prisma.Decimal;
  status: QuoteStatus;
  purchaseId: string | null;
  note: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly configService: ConfigService,
  ) {}

  async create(user: AuthUser, dto: CreateQuoteDto): Promise<QuoteSummary> {
    const organizationId = this.requireOrg(user);
    const quote = await this.prisma.quote.create({
      data: {
        organizationId,
        conversationId: dto.conversationId ?? null,
        customerId: dto.customerId ?? null,
        campaignId: dto.campaignId ?? null,
        productId: dto.productId ?? null,
        quantity: dto.quantity ?? 1,
        value: new Prisma.Decimal(dto.value),
        note: dto.note?.trim() || null,
        createdBy: user.id,
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quote.create',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `quote created quote=${quote.uuid}`,
      metadata: { quoteId: quote.uuid, value: dto.value },
    });
    return this.toSummary(quote);
  }

  async list(
    user: AuthUser,
    query: QueryQuotesDto,
  ): Promise<{
    data: QuoteSummary[];
    meta: { page: number; limit: number; total: number; pages: number };
  }> {
    const organizationId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await this.expireStale(organizationId);

    const where: Prisma.QuoteWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, quotes] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const data = await this.toSummaries(quotes);
    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async get(user: AuthUser, uuid: string): Promise<QuoteSummary> {
    const organizationId = this.requireOrg(user);
    await this.expireStale(organizationId);
    const quote = await this.prisma.quote.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
    if (!quote) {
      throw this.notFound();
    }
    return this.toSummary(quote);
  }

  async update(
    user: AuthUser,
    uuid: string,
    dto: UpdateQuoteDto,
  ): Promise<QuoteSummary> {
    const organizationId = this.requireOrg(user);
    const quote = await this.findScoped(organizationId, uuid);
    if (
      quote.status !== QuoteStatus.DRAFT &&
      quote.status !== QuoteStatus.ENVIADA
    ) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Quote can only be edited while DRAFT or ENVIADA',
        },
      });
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        productId: dto.productId,
        quantity: dto.quantity,
        value:
          dto.value !== undefined ? new Prisma.Decimal(dto.value) : undefined,
        note: dto.note,
        updatedBy: user.id,
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quote.update',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `quote updated quote=${updated.uuid}`,
      metadata: { quoteId: updated.uuid },
    });
    return this.toSummary(updated);
  }

  async send(user: AuthUser, uuid: string): Promise<QuoteSummary> {
    const organizationId = this.requireOrg(user);
    const quote = await this.findScoped(organizationId, uuid);
    if (
      quote.status === QuoteStatus.ACEPTADA ||
      quote.status === QuoteStatus.RECHAZADA ||
      quote.status === QuoteStatus.VENCIDA
    ) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Quote is already finalized',
        },
      });
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: QuoteStatus.ENVIADA,
        sentAt: new Date(),
        updatedBy: user.id,
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quote.send',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `quote sent quote=${updated.uuid}`,
      metadata: { quoteId: updated.uuid },
    });
    return this.toSummary(updated);
  }

  async accept(user: AuthUser, uuid: string): Promise<QuoteSummary> {
    return this.transition(
      user,
      uuid,
      QuoteStatus.ENVIADA,
      QuoteStatus.ACEPTADA,
      { acceptedAt: new Date() },
      'quote.accept',
    );
  }

  async reject(user: AuthUser, uuid: string): Promise<QuoteSummary> {
    return this.transition(
      user,
      uuid,
      QuoteStatus.ENVIADA,
      QuoteStatus.RECHAZADA,
      { rejectedAt: new Date() },
      'quote.reject',
    );
  }

  async expire(user: AuthUser, uuid: string): Promise<QuoteSummary> {
    return this.transition(
      user,
      uuid,
      null,
      QuoteStatus.VENCIDA,
      {},
      'quote.expire',
    );
  }

  private async transition(
    user: AuthUser,
    uuid: string,
    from: QuoteStatus | null,
    to: QuoteStatus,
    extra: Record<string, unknown>,
    action: string,
  ): Promise<QuoteSummary> {
    const organizationId = this.requireOrg(user);
    const quote = await this.findScoped(organizationId, uuid);
    if (from && quote.status !== from) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Quote must be ${from} to apply this transition`,
        },
      });
    }
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: to, ...extra, updatedBy: user.id },
    });
    await this.auditService.record({
      module: MODULE,
      action,
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: `quote ${action.split('.')[1]} quote=${updated.uuid}`,
      metadata: { quoteId: updated.uuid, status: to },
    });
    return this.toSummary(updated);
  }

  // VENCIDA automática por tiempo (configurable) para ENVIADA sin respuesta.
  private async expireStale(organizationId: string): Promise<void> {
    const days = this.configService.get<number>('quotes.expiryDays') ?? 7;
    if (days <= 0) {
      return;
    }
    const cutoff = new Date(Date.now() - days * 86_400_000);
    await this.prisma.quote.updateMany({
      where: {
        organizationId,
        status: QuoteStatus.ENVIADA,
        sentAt: { lte: cutoff },
        deletedAt: null,
      },
      data: { status: QuoteStatus.VENCIDA },
    });
  }

  private async findScoped(organizationId: string, uuid: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { uuid, organizationId, deletedAt: null },
    });
    if (!quote) {
      throw this.notFound();
    }
    return quote as QuoteRow;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      error: { code: 'QUOTE_NOT_FOUND', message: 'Quote not found' },
    });
  }

  private requireOrg(user: AuthUser): string {
    if (user.accountType !== 'ORGANIZATION' || !user.organizationId) {
      throw new BadRequestException({
        error: { code: 'FORBIDDEN', message: 'Organization scope required' },
      });
    }
    return user.organizationId;
  }

  private async toSummaries(quotes: QuoteRow[]): Promise<QuoteSummary[]> {
    const customerIds = [
      ...new Set(quotes.map((q) => q.customerId).filter(Boolean)),
    ] as string[];
    const productIds = [
      ...new Set(quotes.map((q) => q.productId).filter(Boolean)),
    ] as string[];
    const campaignIds = [
      ...new Set(quotes.map((q) => q.campaignId).filter(Boolean)),
    ] as string[];

    const [customers, products, campaigns] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      campaignIds.length
        ? this.prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    const productName = new Map(products.map((p) => [p.id, p.name]));
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

    return quotes.map((quote) => ({
      uuid: quote.uuid,
      status: quote.status,
      customerId: quote.customerId,
      customerName: quote.customerId
        ? (customerName.get(quote.customerId) ?? 'Cliente')
        : 'Cliente',
      conversationId: quote.conversationId,
      campaignId: quote.campaignId,
      campaignName: quote.campaignId
        ? (campaignName.get(quote.campaignId) ?? null)
        : null,
      productId: quote.productId,
      productName: quote.productId
        ? (productName.get(quote.productId) ?? null)
        : null,
      quantity: quote.quantity,
      value: quote.value.toNumber(),
      note: quote.note,
      sentAt: quote.sentAt ? quote.sentAt.toISOString() : null,
      acceptedAt: quote.acceptedAt ? quote.acceptedAt.toISOString() : null,
      purchaseId: quote.purchaseId,
      createdAt: quote.createdAt.toISOString(),
    }));
  }

  private async toSummary(quote: QuoteRow): Promise<QuoteSummary> {
    const [summary] = await this.toSummaries([quote]);
    return summary;
  }
}
