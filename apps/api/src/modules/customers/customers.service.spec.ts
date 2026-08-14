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
import { CustomersService } from './customers.service';

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

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: {
    customer: {
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
      customer: {
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
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  describe('findAll (US1)', () => {
    it('scopes the query to the organization user and returns pagination meta', async () => {
      prisma.customer.count.mockResolvedValue(25);
      prisma.customer.findMany.mockResolvedValue([{ id: 'c-1' }]);

      const result = await service.findAll(orgUser, {});

      expect(prisma.customer.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [{ id: 'c-1' }],
        meta: { page: 1, limit: 20, total: 25, pages: 2 },
      });
    });

    it('applies page and limit to skip/take and meta', async () => {
      prisma.customer.count.mockResolvedValue(35);
      prisma.customer.findMany.mockResolvedValue([]);

      const result = await service.findAll(orgUser, { page: 2, limit: 10 });

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 10,
        take: 10,
      });
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 35, pages: 4 });
    });

    it('lets PLATFORM_OWNER list across all organizations', async () => {
      prisma.customer.count.mockResolvedValue(1);
      prisma.customer.findMany.mockResolvedValue([{ id: 'c-1' }]);

      await service.findAll(platformUser, {});

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('searches name, codcli, phone and email case-insensitively', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { search: 'juan' });

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          OR: [
            { name: { contains: 'juan', mode: 'insensitive' } },
            { codcli: { contains: 'juan', mode: 'insensitive' } },
            { phone: { contains: 'juan', mode: 'insensitive' } },
            { email: { contains: 'juan', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('applies status and city filters', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { status: 'INACTIVE', city: 'Quito' });

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          status: 'INACTIVE',
          city: { contains: 'Quito', mode: 'insensitive' },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('applies created range filters', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        createdFrom: '2026-01-01',
        createdTo: '2026-12-31',
      });

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-31'),
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      });
    });

    it('sorts ascending by a whitelisted field', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.customer.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, { sort: 'name' });

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: [{ name: 'asc' }],
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
    it('finds a customer within the organization scope', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });

      const result = await service.findById(orgUser, 'c-1');

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: 'c-1', organizationId: 'org-1', deletedAt: null },
      });
      expect(result).toEqual({ id: 'c-1' });
    });

    it('lets PLATFORM_OWNER find any customer', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });

      await service.findById(platformUser, 'c-1');

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: 'c-1', deletedAt: null },
      });
    });

    it('returns null for cross-tenant or soft-deleted customers', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.findById(orgUser, 'missing')).resolves.toBeNull();
    });
  });

  describe('create (US3)', () => {
    it('creates a customer for an organization user with createdBy from JWT', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'c-1', codcli: 'C-1' });

      const result = await service.create(orgUser, {
        codcli: 'C-1',
        name: 'Juan Pérez',
        city: 'Quito',
      });

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          codcli: 'C-1',
          name: 'Juan Pérez',
          phone: null,
          email: null,
          address: null,
          city: 'Quito',
          createdBy: 'u-1',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.create',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'customer created codcli=C-1',
      });
      expect(result).toEqual({ id: 'c-1', codcli: 'C-1' });
    });

    it('returns 409 CONFLICT when the codcli already exists in the organization', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-old' });

      await expect(
        service.create(orgUser, { codcli: 'C-1', name: 'Juan' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'duplicate_codcli' },
      });
    });

    it('maps a concurrent P2002 race to 409 CONFLICT', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create(orgUser, { codcli: 'C-1', name: 'Juan' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects organization users that send organizationId', async () => {
      await expect(
        service.create(orgUser, {
          codcli: 'C-1',
          name: 'Juan',
          organizationId: 'org-2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.create',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'tenant_from_client' },
      });
    });

    it('requires organizationId from PLATFORM_OWNER', async () => {
      await expect(
        service.create(platformUser, { codcli: 'C-1', name: 'Juan' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.create',
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
          codcli: 'C-1',
          name: 'Juan',
          organizationId: 'org-x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.create',
        outcome: 'failure',
        userId: 'u-2',
        organizationId: 'org-x',
        metadata: { reason: 'unknown_organization' },
      });
    });

    it('creates in the target organization for PLATFORM_OWNER when it exists', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-9' });
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'c-9' });

      await service.create(platformUser, {
        codcli: 'C-9',
        name: 'Juan',
        organizationId: 'org-9',
      });

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-9',
          codcli: 'C-9',
          name: 'Juan',
          phone: null,
          email: null,
          address: null,
          city: null,
          createdBy: 'u-2',
        },
      });
    });
  });

  describe('update (US4)', () => {
    it('updates contact fields and sets updatedBy from JWT', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'c-1',
        codcli: 'C-1',
        organizationId: 'org-1',
      });
      prisma.customer.update.mockResolvedValue({ id: 'c-1', phone: '099' });

      const result = await service.update(orgUser, 'c-1', { phone: '099' });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: {
          name: undefined,
          phone: '099',
          email: undefined,
          address: undefined,
          city: undefined,
          status: undefined,
          updatedBy: 'u-1',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.update',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'customer updated codcli=C-1',
      });
      expect(result).toEqual({ id: 'c-1', phone: '099' });
    });

    it('returns 404 for cross-tenant or missing customers', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.update(orgUser, 'c-x', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.update',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'not_found' },
      });
    });
  });

  describe('remove (US5)', () => {
    it('soft-deletes a customer setting deletedAt and deletedBy', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'c-1',
        codcli: 'C-1',
        organizationId: 'org-1',
      });
      prisma.customer.update.mockResolvedValue({
        id: 'c-1',
        deletedAt: new Date(),
      });

      await service.remove(orgUser, 'c-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { deletedAt: expect.any(Date) as Date, deletedBy: 'u-1' },
      });
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.delete',
        outcome: 'success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'customer soft-deleted codcli=C-1',
      });
    });

    it('returns 404 when deleting a missing, cross-tenant, or already deleted customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.remove(orgUser, 'c-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(auditService.record).toHaveBeenCalledWith({
        module: 'customers',
        action: 'customer.delete',
        outcome: 'failure',
        userId: 'u-1',
        organizationId: 'org-1',
        metadata: { reason: 'not_found' },
      });
    });
  });

  describe('audit resilience (US7)', () => {
    async function serviceWithFailingAudit(): Promise<CustomersService> {
      const prismaWithFailingAudit = {
        ...prisma,
        audit: { create: jest.fn().mockRejectedValue(new Error('db down')) },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CustomersService,
          { provide: PrismaService, useValue: prismaWithFailingAudit },
          {
            provide: AuditIdentityService,
            useValue: new AuditIdentityService(
              prismaWithFailingAudit as unknown as PrismaService,
            ),
          },
        ],
      }).compile();
      return module.get<CustomersService>(CustomersService);
    }

    it('never breaks create when the audit record fails', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'c-1', codcli: 'C-1' });

      const svc = await serviceWithFailingAudit();

      await expect(
        svc.create(orgUser, { codcli: 'C-1', name: 'Juan' }),
      ).resolves.toEqual({ id: 'c-1', codcli: 'C-1' });
    });

    it('never breaks update when the audit record fails', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.customer.update.mockResolvedValue({ id: 'c-1' });

      const svc = await serviceWithFailingAudit();

      await expect(svc.update(orgUser, 'c-1', { name: 'X' })).resolves.toEqual({
        id: 'c-1',
      });
    });
  });
});
