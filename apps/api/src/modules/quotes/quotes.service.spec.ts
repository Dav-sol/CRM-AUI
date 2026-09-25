import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
import { QuotesService } from './quotes.service';

const orgUser = {
  id: 'u-1',
  accountType: 'ORGANIZATION' as const,
  organizationId: 'org-1',
};

const quoteRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'qt-1',
  uuid: 'quote-uuid-1',
  organizationId: 'org-1',
  conversationId: 'conv-1',
  customerId: 'c-1',
  campaignId: 'camp-1',
  productId: 'p-1',
  quantity: 1,
  value: { toNumber: () => 420000 } as never,
  status: QuoteStatus.DRAFT,
  purchaseId: null,
  note: null,
  sentAt: null,
  acceptedAt: null,
  rejectedAt: null,
  createdAt: new Date('2026-08-25T10:00:00.000Z'),
  ...overrides,
});

describe('QuotesService', () => {
  const prisma = {
    quote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    campaign: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(7) };

  const service = new QuotesService(
    prisma as never,
    audit as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a DRAFT quote with audit', async () => {
    prisma.quote.create.mockResolvedValue(quoteRow());
    const result = await service.create(orgUser, {
      conversationId: 'conv-1',
      customerId: 'c-1',
      productId: 'p-1',
      value: 420000,
    });
    expect(result.status).toBe(QuoteStatus.DRAFT);
    expect(result.uuid).toBe('quote-uuid-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'quote.create' }),
    );
  });

  it('rejects a create outside an organization scope', async () => {
    await expect(
      service.create(
        { id: 'u-1', accountType: 'PLATFORM' as never, organizationId: null },
        { value: 100 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('transitions DRAFT → ENVIADA with sentAt on send', async () => {
    prisma.quote.findFirst.mockResolvedValue(quoteRow());
    prisma.quote.update.mockResolvedValue(
      quoteRow({ status: QuoteStatus.ENVIADA, sentAt: new Date() }),
    );
    const result = await service.send(orgUser, 'quote-uuid-1');
    expect(result.status).toBe(QuoteStatus.ENVIADA);
    expect(result.sentAt).not.toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'quote.send' }),
    );
  });

  it('accepts only an ENVIADA quote', async () => {
    prisma.quote.findFirst.mockResolvedValue(
      quoteRow({ status: QuoteStatus.ENVIADA }),
    );
    prisma.quote.update.mockResolvedValue(
      quoteRow({
        status: QuoteStatus.ACEPTADA,
        acceptedAt: new Date(),
        purchaseId: null,
      }),
    );
    const result = await service.accept(orgUser, 'quote-uuid-1');
    expect(result.status).toBe(QuoteStatus.ACEPTADA);
  });

  it('rejects accepting a DRAFT quote', async () => {
    prisma.quote.findFirst.mockResolvedValue(quoteRow());
    await expect(service.accept(orgUser, 'quote-uuid-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects editing a finalized quote', async () => {
    prisma.quote.findFirst.mockResolvedValue(
      quoteRow({ status: QuoteStatus.VENCIDA }),
    );
    await expect(
      service.update(orgUser, 'quote-uuid-1', { value: 500 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws QUOTE_NOT_FOUND for unknown quotes', async () => {
    prisma.quote.findFirst.mockResolvedValue(null);
    await expect(service.get(orgUser, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('auto-expires stale ENVIADA quotes (expiryDays)', async () => {
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);
    prisma.quote.updateMany.mockResolvedValue({ count: 0 });
    await service.list(orgUser, {});
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: QuoteStatus.ENVIADA,
        }),
        data: { status: QuoteStatus.VENCIDA },
      }),
    );
  });
});
