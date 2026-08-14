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
import { ProductsService } from './products.service';

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

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    organization: { findUnique: jest.Mock };
  };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: { findUnique: jest.fn() },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('findAll (US1)', () => {
    it('scopes the query to the organization user and returns pagination meta', async () => {
      prisma.product.count.mockResolvedValue(25);
      prisma.product.findMany.mockResolvedValue([{ id: 'pr-1' }]);

      const result = await service.findAll(orgUser, {});

      expect(prisma.product.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [{ id: 'pr-1' }],
        meta: { page: 1, limit: 20, total: 25, pages: 2 },
      });
    });

    it('applies page and limit to skip/take and meta', async () => {
      prisma.product.count.mockResolvedValue(35);
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findAll(orgUser, { page: 2, limit: 10 });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 10,
        take: 10,
      });
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 35, pages: 4 });
    });

    it('lets PLATFORM_OWNER list across all organizations', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([{ id: 'pr-1' }]);

      await service.findAll(platformUser, {});

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('searches code, name and category case-insensitively (OR)', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { search: 'bateria' });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          OR: [
            { code: { contains: 'bateria', mode: 'insensitive' } },
            { name: { contains: 'bateria', mode: 'insensitive' } },
            { category: { contains: 'bateria', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('applies status and category filters', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        status: 'INACTIVE',
        category: 'Accesorios',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          status: 'INACTIVE',
          category: 'Accesorios',
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('treats a date-only createdTo as the end of the requested day', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { createdTo: '2026-02-28' });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: { lte: new Date('2026-02-28T23:59:59.999Z') },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('treats a date-only createdFrom as the start of the requested day', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { createdFrom: '2026-02-28' });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: { gte: new Date('2026-02-28T00:00:00.000Z') },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('preserves the exact instant of full datetimes in range filters', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        createdFrom: '2026-02-28T12:30:00Z',
        createdTo: '2026-02-28T18:45:30Z',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: {
            gte: new Date('2026-02-28T12:30:00Z'),
            lte: new Date('2026-02-28T18:45:30Z'),
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('sorts ascending by a whitelisted field', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { sort: 'code' });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ code: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('rejects a non-whitelisted sort field', async () => {
      await expect(
        service.findAll(orgUser, { sort: 'secret' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findById (US2)', () => {
    it('finds a product within the organization scope', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'pr-1' });

      const result = await service.findById(orgUser, 'pr-1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'pr-1', organizationId: 'org-1', deletedAt: null },
      });
      expect(result).toEqual({ id: 'pr-1' });
    });

    it('lets PLATFORM_OWNER find any product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'pr-1' });

      await service.findById(platformUser, 'pr-1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'pr-1', deletedAt: null },
      });
    });

    it('returns null for cross-tenant, unknown, or soft-deleted products', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.findById(orgUser, 'missing')).resolves.toBeNull();
    });
  });

  describe('create (US3)', () => {
    const validDto = { code: 'P-100', name: 'Batería X' };

    it('creates a product for an organization user with createdBy from JWT', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({ id: 'pr-1', code: 'P-100' });

      const result = await service.create(orgUser, validDto);

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', code: 'P-100' },
      });
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          code: 'P-100',
          name: 'Batería X',
          category: null,
          status: undefined,
          createdBy: 'u-1',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.create',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'product created code=P-100',
      });
      expect(result).toEqual({ id: 'pr-1', code: 'P-100' });
    });

    it('persists an explicit status and category on create', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({ id: 'pr-1' });

      await service.create(orgUser, {
        ...validDto,
        category: 'Baterías',
        status: 'INACTIVE',
      });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          code: 'P-100',
          name: 'Batería X',
          category: 'Baterías',
          status: 'INACTIVE',
          createdBy: 'u-1',
        },
      });
    });

    it('returns 409 CONFLICT for a duplicate code (schema.prisma:128)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'pr-old' });

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'duplicate_code' },
      });
    });

    it('returns 409 when the code collides with a soft-deleted row (R-008)', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'pr-deleted',
        deletedAt: new Date(),
      });

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('maps a concurrent P2002 race to 409 CONFLICT', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(orgUser, validDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects organization users that send organizationId', async () => {
      await expect(
        service.create(orgUser, { ...validDto, organizationId: 'org-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.create',
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
        module: 'products',
        action: 'product.create',
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
        module: 'products',
        action: 'product.create',
        outcome: 'failure',
        userId: 'u-2',
        organizationId: 'org-x',
        metadata: { reason: 'unknown_organization' },
      });
    });

    it('creates in the target organization for PLATFORM_OWNER when it exists', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-9' });
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({ id: 'pr-9' });

      await service.create(platformUser, {
        ...validDto,
        organizationId: 'org-9',
      });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-9',
          code: 'P-100',
          name: 'Batería X',
          category: null,
          status: undefined,
          createdBy: 'u-2',
        },
      });
    });
  });

  describe('update (US4)', () => {
    it('updates mutable fields and sets updatedBy from JWT', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'pr-1',
        code: 'P-100',
        organizationId: 'org-1',
      });
      prisma.product.update.mockResolvedValue({
        id: 'pr-1',
        status: 'INACTIVE',
      });

      const result = await service.update(orgUser, 'pr-1', {
        name: 'Batería Z Plus',
        category: 'Baterías Premium',
        status: 'INACTIVE',
      });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: {
          name: 'Batería Z Plus',
          category: 'Baterías Premium',
          status: 'INACTIVE',
          updatedBy: 'u-1',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.update',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'product updated code=P-100',
      });
      expect(result).toEqual({ id: 'pr-1', status: 'INACTIVE' });
    });

    it('returns 404 for cross-tenant, missing, or soft-deleted products', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.update(orgUser, 'pr-x', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.update',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'not_found' },
      });
    });
  });

  describe('remove (US5)', () => {
    it('soft-deletes the product setting deletedAt and deletedBy', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'pr-1',
        code: 'P-100',
        organizationId: 'org-1',
      });
      prisma.product.update.mockResolvedValue({
        id: 'pr-1',
        deletedAt: new Date(),
        deletedBy: 'u-1',
      });

      const result = await service.remove(orgUser, 'pr-1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'pr-1', organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: { deletedAt: expect.any(Date) as Date, deletedBy: 'u-1' },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.delete',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'product soft-deleted code=P-100',
      });
      expect(result.deletedBy).toBe('u-1');
    });

    it('returns 404 for cross-tenant, missing, or already soft-deleted products', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.remove(orgUser, 'pr-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'products',
        action: 'product.delete',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'not_found' },
      });
    });
  });

  describe('audit resilience (US7)', () => {
    async function serviceWithFailingAudit(): Promise<ProductsService> {
      const prismaWithFailingAudit = {
        ...prisma,
        audit: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ProductsService,
          { provide: PrismaService, useValue: prismaWithFailingAudit },
          {
            provide: AuditIdentityService,
            useValue: new AuditIdentityService(
              prismaWithFailingAudit as unknown as PrismaService,
            ),
          },
        ],
      }).compile();
      return module.get<ProductsService>(ProductsService);
    }

    it('never breaks create when the audit record fails', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({ id: 'pr-1' });

      const svc = await serviceWithFailingAudit();

      await expect(
        svc.create(orgUser, { code: 'P-100', name: 'Batería X' }),
      ).resolves.toEqual({ id: 'pr-1' });
    });

    it('never breaks update when the audit record fails', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'pr-1' });
      prisma.product.update.mockResolvedValue({ id: 'pr-1' });

      const svc = await serviceWithFailingAudit();

      await expect(svc.update(orgUser, 'pr-1', { name: 'X' })).resolves.toEqual(
        { id: 'pr-1' },
      );
    });

    it('never breaks delete when the audit record fails', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'pr-1' });
      prisma.product.update.mockResolvedValue({ id: 'pr-1' });

      const svc = await serviceWithFailingAudit();

      await expect(svc.remove(orgUser, 'pr-1')).resolves.toEqual({
        id: 'pr-1',
      });
    });
  });
});
