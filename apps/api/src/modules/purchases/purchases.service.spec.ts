import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { PurchasesService } from './purchases.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const platformUser: AuthUser = {
  id: 'u-2',
  uuid: 'uu-2',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
};

const PURCHASE_INCLUDE = {
  customer: { select: { id: true, codcli: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
};

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: {
    purchase: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    customer: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
    organization: { findUnique: jest.Mock };
  };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchase: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      customer: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
      organization: { findUnique: jest.fn() },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  describe('findAll (US1)', () => {
    it('scopes the query to the organization user and returns pagination meta', async () => {
      prisma.purchase.count.mockResolvedValue(25);
      prisma.purchase.findMany.mockResolvedValue([{ id: 'p-1' }]);

      const result = await service.findAll(orgUser, {});

      expect(prisma.purchase.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
      expect(result).toEqual({
        data: [{ id: 'p-1' }],
        meta: { page: 1, limit: 20, total: 25, pages: 2 },
      });
    });

    it('applies page and limit to skip/take and meta', async () => {
      prisma.purchase.count.mockResolvedValue(35);
      prisma.purchase.findMany.mockResolvedValue([]);

      const result = await service.findAll(orgUser, { page: 2, limit: 10 });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 10,
        take: 10,
        include: PURCHASE_INCLUDE,
      });
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 35, pages: 4 });
    });

    it('lets PLATFORM_OWNER list across all organizations', async () => {
      prisma.purchase.count.mockResolvedValue(1);
      prisma.purchase.findMany.mockResolvedValue([{ id: 'p-1' }]);

      await service.findAll(platformUser, {});

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('searches invoiceNumber case-insensitively', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { search: 'inv-001' });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          invoiceNumber: { contains: 'inv-001', mode: 'insensitive' },
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('applies customerId, productId and status filters', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        customerId: 'c-1',
        productId: 'p-9',
        status: 'CANCELLED',
      });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          customerId: 'c-1',
          productId: 'p-9',
          status: 'CANCELLED',
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('applies purchaseDate range filters', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-12-31T23:59:59.999Z'),
          },
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('treats a date-only dateTo as the end of the requested day', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { dateTo: '2026-02-28' });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: {
            lte: new Date('2026-02-28T23:59:59.999Z'),
          },
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('treats a date-only dateFrom as the start of the requested day', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { dateFrom: '2026-02-28' });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: {
            gte: new Date('2026-02-28T00:00:00.000Z'),
          },
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('preserves the exact instant of full datetimes in range filters', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        dateFrom: '2026-02-28T12:30:00Z',
        dateTo: '2026-02-28T18:45:30Z',
      });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          purchaseDate: {
            gte: new Date('2026-02-28T12:30:00Z'),
            lte: new Date('2026-02-28T18:45:30Z'),
          },
        },
        orderBy: [{ purchaseDate: 'desc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('sorts ascending by a whitelisted field', async () => {
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { sort: 'invoiceNumber' });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ invoiceNumber: 'asc' }],
        skip: 0,
        take: 20,
        include: PURCHASE_INCLUDE,
      });
    });

    it('rejects a non-whitelisted sort field', async () => {
      await expect(
        service.findAll(orgUser, { sort: 'secret' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findById (US2)', () => {
    it('finds a purchase within the organization scope with summaries', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ id: 'p-1' });

      const result = await service.findById(orgUser, 'p-1');

      expect(prisma.purchase.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', organizationId: 'org-1', deletedAt: null },
        include: PURCHASE_INCLUDE,
      });
      expect(result).toEqual({ id: 'p-1' });
    });

    it('lets PLATFORM_OWNER find any purchase', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ id: 'p-1' });

      await service.findById(platformUser, 'p-1');

      expect(prisma.purchase.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', deletedAt: null },
        include: PURCHASE_INCLUDE,
      });
    });

    it('returns null for cross-tenant or unknown purchases', async () => {
      prisma.purchase.findFirst.mockResolvedValue(null);

      await expect(service.findById(orgUser, 'missing')).resolves.toBeNull();
    });
  });

  describe('create (US3)', () => {
    const validDto = {
      customerId: 'c-1',
      productId: 'p-1',
      invoiceNumber: 'INV-0001',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 2,
      value: '450.50',
    };

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
    });

    it('creates a purchase for an organization user with createdBy from JWT', async () => {
      prisma.purchase.findFirst.mockResolvedValue(null);
      prisma.purchase.create.mockResolvedValue({
        id: 'p-1',
        invoiceNumber: 'INV-0001',
      });

      const result = await service.create(orgUser, validDto);

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: 'c-1', organizationId: 'org-1', deletedAt: null },
        select: { id: true },
      });
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', organizationId: 'org-1', deletedAt: null },
        select: { id: true, warrantyMonths: true },
      });
      expect(prisma.purchase.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          customerId: 'c-1',
          productId: 'p-1',
          invoiceNumber: 'INV-0001',
          purchaseDate: new Date('2026-07-22T14:35:18Z'),
          warrantyMonths: null,
          warrantyExpiresAt: null,
          quantity: 2,
          value: new Prisma.Decimal('450.50'),
          status: undefined,
          createdBy: 'u-1',
        },
        include: PURCHASE_INCLUDE,
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'purchase created invoice=INV-0001',
      });
      expect(result).toEqual({ id: 'p-1', invoiceNumber: 'INV-0001' });
    });

    it('persists an explicit status on create', async () => {
      prisma.purchase.findFirst.mockResolvedValue(null);
      prisma.purchase.create.mockResolvedValue({ id: 'p-1' });

      await service.create(orgUser, { ...validDto, status: 'REFUNDED' });

      expect(prisma.purchase.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          customerId: 'c-1',
          productId: 'p-1',
          invoiceNumber: 'INV-0001',
          purchaseDate: new Date('2026-07-22T14:35:18Z'),
          warrantyMonths: null,
          warrantyExpiresAt: null,
          quantity: 2,
          value: new Prisma.Decimal('450.50'),
          status: 'REFUNDED',
          createdBy: 'u-1',
        },
        include: PURCHASE_INCLUDE,
      });
    });

    it('returns 409 CONFLICT for a duplicate tuple (CP-005)', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ id: 'p-old' });

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'duplicate_purchase' },
      });
    });

    it('maps a concurrent P2002 race to 409 CONFLICT', async () => {
      prisma.purchase.findFirst.mockResolvedValue(null);
      prisma.purchase.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a customerId outside the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'invalid_customer' },
      });
    });

    it('rejects a productId outside the tenant (HG-3)', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'invalid_product' },
      });
    });

    it('rejects organization users that send organizationId', async () => {
      await expect(
        service.create(orgUser, { ...validDto, organizationId: 'org-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'tenant_from_client' },
      });
    });

    it('requires organizationId from PLATFORM_OWNER', async () => {
      await expect(
        service.create(platformUser, validDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-2',
        organizationId: null,
        metadata: { reason: 'missing_organization' },
      });
    });

    it('rejects PLATFORM_OWNER creates with an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.create(platformUser, {
          ...validDto,
          organizationId: 'org-x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.create',
        outcome: 'failure',
        userId: 'u-2',
        organizationId: 'org-x',
        metadata: { reason: 'unknown_organization' },
      });
    });

    it('creates in the target organization for PLATFORM_OWNER when it exists', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-9' });
      prisma.purchase.findFirst.mockResolvedValue(null);
      prisma.purchase.create.mockResolvedValue({ id: 'p-9' });

      await service.create(platformUser, {
        ...validDto,
        organizationId: 'org-9',
      });

      expect(prisma.purchase.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-9',
          customerId: 'c-1',
          productId: 'p-1',
          invoiceNumber: 'INV-0001',
          purchaseDate: new Date('2026-07-22T14:35:18Z'),
          warrantyMonths: null,
          warrantyExpiresAt: null,
          quantity: 2,
          value: new Prisma.Decimal('450.50'),
          status: undefined,
          createdBy: 'u-2',
        },
        include: PURCHASE_INCLUDE,
      });
    });
  });

  describe('update (US4)', () => {
    it('updates mutable fields and sets updatedBy from JWT', async () => {
      prisma.purchase.findFirst.mockResolvedValue({
        id: 'p-1',
        invoiceNumber: 'INV-0001',
        organizationId: 'org-1',
      });
      prisma.purchase.update.mockResolvedValue({
        id: 'p-1',
        status: 'CANCELLED',
      });

      const result = await service.update(orgUser, 'p-1', {
        quantity: 3,
        status: 'CANCELLED',
        value: '10.00',
      });

      expect(prisma.purchase.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: {
          purchaseDate: undefined,
          quantity: 3,
          value: new Prisma.Decimal('10.00'),
          status: 'CANCELLED',
          updatedBy: 'u-1',
        },
        include: PURCHASE_INCLUDE,
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.update',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'purchase updated invoice=INV-0001',
      });
      expect(result).toEqual({ id: 'p-1', status: 'CANCELLED' });
    });

    it('returns 404 for cross-tenant or missing purchases', async () => {
      prisma.purchase.findFirst.mockResolvedValue(null);

      await expect(
        service.update(orgUser, 'p-x', { quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'purchases',
        action: 'purchase.update',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'not_found' },
      });
    });
  });

  describe('audit resilience (US6)', () => {
    async function serviceWithFailingAudit(): Promise<PurchasesService> {
      const prismaWithFailingAudit = {
        ...prisma,
        audit: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PurchasesService,
          { provide: PrismaService, useValue: prismaWithFailingAudit },
          {
            provide: AuditIdentityService,
            useValue: new AuditIdentityService(
              prismaWithFailingAudit as unknown as PrismaService,
            ),
          },
        ],
      }).compile();
      return module.get<PurchasesService>(PurchasesService);
    }

    it('never breaks create when the audit record fails', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      prisma.purchase.findFirst.mockResolvedValue(null);
      prisma.purchase.create.mockResolvedValue({ id: 'p-1' });

      const svc = await serviceWithFailingAudit();

      await expect(
        svc.create(orgUser, {
          customerId: 'c-1',
          productId: 'p-1',
          invoiceNumber: 'INV-0001',
          purchaseDate: '2026-07-22T14:35:18Z',
          quantity: 1,
          value: '1.00',
        }),
      ).resolves.toEqual({ id: 'p-1' });
    });

    it('never breaks update when the audit record fails', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ id: 'p-1' });
      prisma.purchase.update.mockResolvedValue({ id: 'p-1' });

      const svc = await serviceWithFailingAudit();

      await expect(
        svc.update(orgUser, 'p-1', { quantity: 1 }),
      ).resolves.toEqual({ id: 'p-1' });
    });
  });

  describe('warrantyMonths override (HG-01)', () => {
    const baseDto = {
      customerId: 'c-1',
      productId: 'p-1',
      invoiceNumber: 'INV-0002',
      purchaseDate: '2026-08-01T00:00:00Z',
      quantity: 1,
      value: '100.00',
    };

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        warrantyMonths: 12,
      });
      prisma.purchase.findFirst.mockResolvedValue(null);
    });

    it('inherits Product.warrantyMonths when no override provided', async () => {
      prisma.purchase.create.mockResolvedValue({ id: 'p-1' });

      await service.create(orgUser, baseDto);

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warrantyMonths: 12,
            warrantyExpiresAt: new Date('2027-08-01T00:00:00.000Z'),
          }),
        }),
      );
    });

    it('persists explicit warrantyMonths override and uses it for expiration', async () => {
      prisma.purchase.create.mockResolvedValue({ id: 'p-1' });

      await service.create(orgUser, { ...baseDto, warrantyMonths: 24 });

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warrantyMonths: 24,
            warrantyExpiresAt: new Date('2028-08-01T00:00:00.000Z'),
          }),
        }),
      );
    });

    it('uses override even when Product.warrantyMonths is null', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        warrantyMonths: null,
      });
      prisma.purchase.create.mockResolvedValue({ id: 'p-1' });

      await service.create(orgUser, { ...baseDto, warrantyMonths: 15 });

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warrantyMonths: 15,
            warrantyExpiresAt: new Date('2027-11-01T00:00:00.000Z'),
          }),
        }),
      );
    });

    it('rejects invalid warrantyMonths values via DTO validation', async () => {
      await expect(
        service.create(orgUser, { ...baseDto, warrantyMonths: 13 }),
      ).rejects.toThrow();
    });
  });

  describe('stats (P5)', () => {
    it('returns global aggregates scoped to the organization', async () => {
      prisma.purchase.aggregate.mockResolvedValue({
        _count: { _all: 10 },
        _sum: { value: new Prisma.Decimal(1250.5), quantity: 24 },
      });
      prisma.purchase.count.mockResolvedValue(3);
      prisma.purchase.findMany.mockResolvedValue([
        { customerId: 'c-1' },
        { customerId: 'c-2' },
        { customerId: 'c-3' },
      ]);

      const result = await service.stats(orgUser, {});

      expect(prisma.purchase.aggregate).toHaveBeenCalledWith({
        where: { deletedAt: null, organizationId: 'org-1' },
        _count: { _all: true },
        _sum: { value: true, quantity: true },
      });
      expect(prisma.purchase.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          organizationId: 'org-1',
          warrantyExpiresAt: { gte: expect.any(Date) as unknown },
        },
      });
      expect(result).toEqual({
        total: 10,
        totalValue: new Prisma.Decimal(1250.5),
        units: 24,
        activeWarranties: 3,
        customers: 3,
      });
    });

    it('applies date range and status filters to every aggregate', async () => {
      prisma.purchase.aggregate.mockResolvedValue({
        _count: { _all: 4 },
        _sum: { value: new Prisma.Decimal(500), quantity: 8 },
      });
      prisma.purchase.count.mockResolvedValue(1);
      prisma.purchase.findMany.mockResolvedValue([{ customerId: 'c-1' }]);

      await service.stats(orgUser, {
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        status: 'COMPLETED',
      });

      const expectedWhere = {
        deletedAt: null,
        organizationId: 'org-1',
        status: 'COMPLETED',
        purchaseDate: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-31T23:59:59.999Z'),
        },
      };
      expect(prisma.purchase.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.purchase.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          distinct: ['customerId'],
        }),
      );
    });

    it('lets PLATFORM_OWNER aggregate without org scope', async () => {
      prisma.purchase.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { value: new Prisma.Decimal(0), quantity: 0 },
      });
      prisma.purchase.count.mockResolvedValue(0);
      prisma.purchase.findMany.mockResolvedValue([]);

      const result = await service.stats(platformUser, {});

      expect(prisma.purchase.aggregate).toHaveBeenCalledWith({
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { value: true, quantity: true },
      });
      expect(result.total).toBe(0);
    });
  });
});
