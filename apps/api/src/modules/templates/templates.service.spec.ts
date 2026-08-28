import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { TemplatesService } from './templates.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

function mockTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    uuid: 'uuid-tpl-1',
    organizationId: 'org-1',
    code: 'BW-001',
    name: 'Bienvenida cálida',
    group: 'Bienvenida y postventa',
    category: 'CAMPAIGN' as const,
    tone: 'PROFESSIONAL' as const,
    angle: 'TRUST' as const,
    goal: 'Generar confianza',
    recommendedUse: 'Post-registro',
    body: 'Hola {customerName}',
    deletedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: Record<string, jest.Mock>;
  let audit: Record<string, jest.Mock>;

  beforeEach(async () => {
    prisma = {
      template: {
        findMany: jest.fn().mockResolvedValue([mockTemplate()]),
        findFirst: jest.fn().mockResolvedValue(mockTemplate()),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve(mockTemplate({ uuid: 'new-uuid', ...data })),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve(mockTemplate({ ...where, ...data })),
        ),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: audit },
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  describe('findAll', () => {
    it('returns paginated templates for the org', async () => {
      const result = await service.findAll(orgUser, {});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('filters by search term', async () => {
      await service.findAll(orgUser, { search: 'garantía' });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });

    it('filters by category', async () => {
      await service.findAll(orgUser, { category: 'CAMPAIGN' });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'CAMPAIGN' }),
        }),
      );
    });

    it('filters by tone', async () => {
      await service.findAll(orgUser, { tone: 'PROFESSIONAL' });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tone: 'PROFESSIONAL' }),
        }),
      );
    });

    it('filters by angle', async () => {
      await service.findAll(orgUser, { angle: 'TRUST' });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ angle: 'TRUST' }),
        }),
      );
    });

    it('filters by group', async () => {
      await service.findAll(orgUser, { group: 'Bienvenida y postventa' });
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ group: 'Bienvenida y postventa' }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns template by uuid', async () => {
      const result = await service.findById(orgUser, 'uuid-tpl-1');
      expect(result).not.toBeNull();
      expect(result!.uuid).toBe('uuid-tpl-1');
    });

    it('returns null if not found', async () => {
      prisma.template.findFirst.mockResolvedValue(null);
      const result = await service.findById(orgUser, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates template with all fields', async () => {
      const dto = {
        name: 'Test Template',
        code: 'TEST-001',
        group: 'Test Group',
        category: 'CAMPAIGN' as const,
        tone: 'PROFESSIONAL' as const,
        angle: 'TRUST' as const,
        goal: 'Test goal',
        recommendedUse: 'Test use',
        body: 'Hola {customerName}',
      };
      const result = await service.create(orgUser, dto);
      expect(result.name).toBe('Test Template');
      expect(prisma.template.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates existing template', async () => {
      const result = await service.update(orgUser, 'uuid-tpl-1', {
        name: 'Updated Name',
      });
      expect(result.name).toBe('Updated Name');
      expect(prisma.template.update).toHaveBeenCalled();
    });

    it('throws if template not found', async () => {
      prisma.template.findFirst.mockResolvedValue(null);
      await expect(
        service.update(orgUser, 'nonexistent', { name: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if no fields provided', async () => {
      await expect(
        service.update(orgUser, 'uuid-tpl-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('soft-deletes template', async () => {
      await service.remove(orgUser, 'uuid-tpl-1');
      expect(prisma.template.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws if template not found', async () => {
      prisma.template.findFirst.mockResolvedValue(null);
      await expect(service.remove(orgUser, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
