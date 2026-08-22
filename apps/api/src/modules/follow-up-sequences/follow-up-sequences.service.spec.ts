import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { FollowUpSequencesService } from './follow-up-sequences.service';

const adminUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const operadorUser: AuthUser = {
  id: 'u-3',
  uuid: 'uu-3',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

const platformUser: AuthUser = {
  id: 'u-2',
  uuid: 'uu-2',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
};

const validStages = [
  {
    name: 'Día 0',
    anchor: 'WARRANTY_EXPIRY',
    offsetDays: -360,
    template: 'Hola {customerName}',
  },
  {
    name: 'Mitad',
    anchor: 'WARRANTY_EXPIRY',
    offsetDays: -180,
    template: 'Chequeo gratuito',
  },
  {
    name: 'Renovación',
    anchor: 'WARRANTY_EXPIRY',
    offsetDays: -30,
    template: 'Plan Retorno',
  },
];

const validCreateDto = {
  name: 'Garantía 12 meses',
  description: 'Secuencia base',
  warrantyMonths: 12 as const,
  stages: validStages,
};

describe('FollowUpSequencesService', () => {
  let service: FollowUpSequencesService;
  let prisma: {
    followUpSequence: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    followUpSequenceStage: {
      updateMany: jest.Mock;
      createMany: jest.Mock;
    };
    campaign: { count: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let tx: {
    followUpSequence: { findFirst: jest.Mock; update: jest.Mock };
    followUpSequenceStage: { updateMany: jest.Mock; createMany: jest.Mock };
    campaign: { count: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      followUpSequence: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      followUpSequenceStage: {
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
      campaign: { count: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'seq-row-1' }]),
      $transaction: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    // Interactive transaction passthrough: run the callback against a dedicated
    // tx client whose calls we can assert on.
    tx = {
      followUpSequence: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      followUpSequenceStage: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      campaign: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'seq-row-1' }]),
    };
    prisma.$transaction.mockImplementation((fn: (client: unknown) => unknown) =>
      fn(tx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpSequencesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
      ],
    }).compile();

    service = module.get<FollowUpSequencesService>(FollowUpSequencesService);
  });

  describe('create', () => {
    it('creates a sequence with its stages and audits the action', async () => {
      prisma.followUpSequence.create.mockResolvedValue({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date('2026-08-21T00:00:00Z'),
        stages: validStages,
      });

      const result = await service.create(adminUser, validCreateDto);

      expect(prisma.followUpSequence.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: validCreateDto.name,
          description: validCreateDto.description,
          warrantyMonths: 12,
          createdBy: 'u-1',
          stages: {
            create: validStages.map((stage) => ({
              ...stage,
              createdBy: 'u-1',
            })),
          },
        },
        include: { stages: true },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'follow_up_sequences',
          action: 'follow_up_sequence.create',
          outcome: 'success',
          userId: 'u-1',
          organizationId: 'org-1',
        }),
      );
      expect(result).toEqual({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date('2026-08-21T00:00:00Z'),
      });
    });

    it('rejects an empty stage list', async () => {
      await expect(
        service.create(adminUser, { ...validCreateDto, stages: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.followUpSequence.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate anchor+offset combinations within the payload', async () => {
      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          stages: [
            { name: 'A', offsetDays: -30, template: 'x' },
            { name: 'B', offsetDays: -30, template: 'y' },
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('Duplicate stage'),
          },
        },
      });
      expect(prisma.followUpSequence.create).not.toHaveBeenCalled();
    });

    it('allows the same offsetDays under different anchors', async () => {
      prisma.followUpSequence.create.mockResolvedValue({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date(),
        stages: validStages,
      });

      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          stages: [
            {
              name: 'A',
              anchor: 'PURCHASE_DATE',
              offsetDays: 30,
              template: 'x',
            },
            {
              name: 'B',
              anchor: 'WARRANTY_EXPIRY',
              offsetDays: 30,
              template: 'y',
            },
          ],
        }),
      ).resolves.toBeDefined();

      const [call] = prisma.followUpSequence.create.mock.calls[0] as [
        { data: { stages: { create: Array<Record<string, unknown>> } } },
      ];
      expect(call.data.stages.create.map((s) => s.anchor)).toEqual([
        'PURCHASE_DATE',
        'WARRANTY_EXPIRY',
      ]);
    });

    it('defaults missing anchor to WARRANTY_EXPIRY and persists templateOnPast', async () => {
      prisma.followUpSequence.create.mockResolvedValue({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date(),
        stages: validStages,
      });

      await service.create(adminUser, {
        ...validCreateDto,
        stages: [
          {
            name: 'Recompra',
            offsetDays: -60,
            template: 'original',
            templateOnPast: 'renovación',
          },
        ],
      });

      const [call] = prisma.followUpSequence.create.mock.calls[0] as [
        { data: { stages: { create: Array<Record<string, unknown>> } } },
      ];
      expect(call.data.stages.create[0]).toMatchObject({
        anchor: 'WARRANTY_EXPIRY',
        templateOnPast: 'renovación',
      });
    });

    it('rejects negative offsetDays for PURCHASE_DATE anchors', async () => {
      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          stages: [
            {
              name: 'A',
              anchor: 'PURCHASE_DATE',
              offsetDays: -1,
              template: 'x',
            },
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('PURCHASE_DATE'),
          },
        },
      });
      expect(prisma.followUpSequence.create).not.toHaveBeenCalled();
    });

    it('accepts WARRANTY_EXPIRY offsets beyond 365 and rejects above 730', async () => {
      prisma.followUpSequence.create.mockResolvedValue({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date(),
        stages: validStages,
      });

      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          stages: [
            {
              name: 'A',
              anchor: 'WARRANTY_EXPIRY',
              offsetDays: 400,
              template: 'x',
            },
          ],
        }),
      ).resolves.toBeDefined();

      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          stages: [
            {
              name: 'A',
              anchor: 'WARRANTY_EXPIRY',
              offsetDays: 731,
              template: 'x',
            },
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('between -365 and 730'),
          },
        },
      });
    });

    it('accepts every catalog warrantyMonths value and rejects values outside it', async () => {
      prisma.followUpSequence.create.mockResolvedValue({
        uuid: 'fus-1',
        name: validCreateDto.name,
        organizationId: 'org-1',
        createdAt: new Date(),
        stages: validStages,
      });

      for (const months of [12, 15, 18, 24] as const) {
        await expect(
          service.create(adminUser, {
            ...validCreateDto,
            warrantyMonths: months,
          }),
        ).resolves.toBeDefined();
      }

      await expect(
        service.create(adminUser, {
          ...validCreateDto,
          warrantyMonths: 13 as never,
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'VALIDATION_ERROR',
            message: expect.stringContaining('warrantyMonths must be one of'),
          },
        },
      });
      expect(prisma.followUpSequence.create).toHaveBeenCalledTimes(4);
    });

    it('denies PLATFORM_OWNER without organization scope', async () => {
      await expect(
        service.create(platformUser, validCreateDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.followUpSequence.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes to the organization and returns pagination meta with stageCount', async () => {
      prisma.followUpSequence.count.mockResolvedValue(2);
      prisma.followUpSequence.findMany.mockResolvedValue([
        {
          uuid: 'fus-1',
          name: 'A',
          description: null,
          warrantyMonths: 12,
          stages: [{ id: 's1' }, { id: 's2' }],
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
      ]);

      const result = await service.list(adminUser, {});

      expect(prisma.followUpSequence.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
      });
      expect(prisma.followUpSequence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', deletedAt: null },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.data[0]).toMatchObject({ uuid: 'fus-1', stageCount: 2 });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    });

    it('applies page/limit skip-take math', async () => {
      prisma.followUpSequence.count.mockResolvedValue(45);
      prisma.followUpSequence.findMany.mockResolvedValue([]);

      const result = await service.list(adminUser, { page: 3, limit: 10 });

      expect(prisma.followUpSequence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.meta).toEqual({ page: 3, limit: 10, total: 45, pages: 5 });
    });

    it('filters by case-insensitive name search and exact warrantyMonths', async () => {
      prisma.followUpSequence.count.mockResolvedValue(0);
      prisma.followUpSequence.findMany.mockResolvedValue([]);

      await service.list(adminUser, { search: 'garantía', warrantyMonths: 24 });

      expect(prisma.followUpSequence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            deletedAt: null,
            name: { contains: 'garantía', mode: 'insensitive' },
            warrantyMonths: 24,
          },
        }),
      );
    });

    it('supports whitelisted sort fields with direction prefix', async () => {
      prisma.followUpSequence.count.mockResolvedValue(0);
      prisma.followUpSequence.findMany.mockResolvedValue([]);

      await service.list(adminUser, { sort: 'name' });
      expect(prisma.followUpSequence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );

      await service.list(adminUser, { sort: '-warrantyMonths' });
      expect(prisma.followUpSequence.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderBy: { warrantyMonths: 'desc' } }),
      );
    });

    it('rejects a non-whitelisted sort field', async () => {
      await expect(
        service.list(adminUser, { sort: 'organizationId' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('detail', () => {
    it('returns the sequence with stages ordered by (anchor, offsetDays) asc', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue({
        uuid: 'fus-1',
        name: 'A',
        description: null,
        warrantyMonths: 12,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-02T00:00:00Z'),
        stages: [
          {
            uuid: 'st-3',
            name: 'Renovación',
            anchor: 'WARRANTY_EXPIRY',
            offsetDays: -30,
            template: 't3',
            createdAt: new Date(),
          },
          {
            uuid: 'st-1',
            name: 'Día 0',
            anchor: 'WARRANTY_EXPIRY',
            offsetDays: -360,
            template: 't1',
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.detail(adminUser, 'fus-1');

      expect(prisma.followUpSequence.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'fus-1', organizationId: 'org-1', deletedAt: null },
        include: {
          stages: {
            where: { deletedAt: null },
            orderBy: [{ anchor: 'asc' }, { offsetDays: 'asc' }],
          },
        },
      });
      expect(result.stageCount).toBe(2);
      expect(result.stages.map((s) => s.offsetDays)).toEqual([-30, -360]);
    });

    it('returns 404 for unknown or cross-tenant sequences', async () => {
      prisma.followUpSequence.findFirst.mockResolvedValue(null);

      await expect(service.detail(adminUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.followUpSequence.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uuid: 'missing', organizationId: 'org-1', deletedAt: null },
        }),
      );
    });
  });

  describe('update', () => {
    function arrangeFoundSequence() {
      tx.followUpSequence.findFirst.mockResolvedValue({
        id: 'row-1',
        uuid: 'fus-1',
      });
      tx.followUpSequence.update.mockResolvedValue({
        uuid: 'fus-1',
        name: 'Nuevo nombre',
      });
    }

    it('renames without touching stages and audits the change', async () => {
      arrangeFoundSequence();

      const result = await service.update(adminUser, 'fus-1', {
        name: 'Nuevo nombre',
      });

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.campaign.count).toHaveBeenCalledWith({
        where: { followUpSequenceId: 'row-1', deletedAt: null },
      });
      expect(tx.followUpSequence.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: {
          name: 'Nuevo nombre',
          description: undefined,
          updatedBy: 'u-1',
        },
      });
      expect(tx.followUpSequenceStage.updateMany).not.toHaveBeenCalled();
      expect(tx.followUpSequenceStage.createMany).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'follow_up_sequence.update' }),
      );
      expect(result).toEqual({ uuid: 'fus-1', name: 'Nuevo nombre' });
    });

    it('replaces stages atomically (soft-delete then recreate) inside one transaction', async () => {
      arrangeFoundSequence();
      tx.followUpSequenceStage.createMany.mockResolvedValue({ count: 2 });

      await service.update(adminUser, 'fus-1', {
        stages: [
          { name: 'Nueva A', offsetDays: -100, template: 'ta' },
          { name: 'Nueva B', offsetDays: -50, template: 'tb' },
        ],
      });

      expect(tx.followUpSequenceStage.updateMany).toHaveBeenCalledWith({
        where: { sequenceId: 'row-1', deletedAt: null },
        data: { deletedAt: expect.any(Date), deletedBy: 'u-1' },
      });
      expect(tx.followUpSequenceStage.createMany).toHaveBeenCalledWith({
        data: [
          {
            sequenceId: 'row-1',
            name: 'Nueva A',
            anchor: 'WARRANTY_EXPIRY',
            offsetDays: -100,
            template: 'ta',
            templateOnPast: undefined,
            createdBy: 'u-1',
          },
          {
            sequenceId: 'row-1',
            name: 'Nueva B',
            anchor: 'WARRANTY_EXPIRY',
            offsetDays: -50,
            template: 'tb',
            templateOnPast: undefined,
            createdBy: 'u-1',
          },
        ],
      });
      // Lock acquired before any stage mutation (concurrency protection).
      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const deleteOrder =
        tx.followUpSequenceStage.updateMany.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(deleteOrder);
    });

    it('blocks warrantyMonths/stages changes while referenced by campaigns but allows rename', async () => {
      arrangeFoundSequence();
      tx.campaign.count.mockResolvedValue(3);

      await expect(
        service.update(adminUser, 'fus-1', { warrantyMonths: 24 }),
      ).rejects.toMatchObject({
        response: {
          error: { message: expect.stringContaining('used by campaigns') },
        },
      });
      await expect(
        service.update(adminUser, 'fus-1', {
          stages: [{ name: 'X', offsetDays: 0, template: 't' }],
        }),
      ).rejects.toMatchObject({
        response: {
          error: { message: expect.stringContaining('used by campaigns') },
        },
      });
      expect(tx.followUpSequenceStage.updateMany).not.toHaveBeenCalled();

      await service.update(adminUser, 'fus-1', { name: 'Solo nombre' });
      expect(tx.followUpSequence.update).toHaveBeenCalled();
    });

    it('rejects duplicate anchor+offset and incomplete stages during replacement', async () => {
      arrangeFoundSequence();

      await expect(
        service.update(adminUser, 'fus-1', {
          stages: [
            { name: 'A', offsetDays: -10, template: 't' },
            { name: 'B', offsetDays: -10, template: 't' },
          ],
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            message: expect.stringContaining('Duplicate stage'),
          },
        },
      });

      await expect(
        service.update(adminUser, 'fus-1', {
          stages: [{ name: '', offsetDays: -10, template: 't' }],
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            message: expect.stringContaining('requires name and template'),
          },
        },
      });

      expect(tx.followUpSequenceStage.updateMany).not.toHaveBeenCalled();
      expect(tx.followUpSequenceStage.createMany).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown or cross-tenant sequences without locking writes', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue(null);

      await expect(
        service.update(adminUser, 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(tx.followUpSequence.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes and audits when not referenced by campaigns', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue({
        id: 'row-1',
        uuid: 'fus-1',
      });
      tx.followUpSequence.update.mockResolvedValue({ uuid: 'fus-1' });

      const result = await service.remove(adminUser, 'fus-1');

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.campaign.count).toHaveBeenCalledWith({
        where: { followUpSequenceId: 'row-1', deletedAt: null },
      });
      expect(tx.followUpSequence.update).toHaveBeenCalledWith({
        where: { id: 'row-1' },
        data: { deletedAt: expect.any(Date), deletedBy: 'u-1' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'follow_up_sequence.delete' }),
      );
      expect(result).toEqual({ uuid: 'fus-1', success: true });
    });

    it('blocks deletion while referenced by campaigns', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue({
        id: 'row-1',
        uuid: 'fus-1',
      });
      tx.campaign.count.mockResolvedValue(1);

      await expect(service.remove(adminUser, 'fus-1')).rejects.toMatchObject({
        response: {
          error: {
            message: expect.stringContaining(
              'Cannot delete a sequence used by campaigns',
            ),
          },
        },
      });
      expect(tx.followUpSequence.update).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown or cross-tenant sequences', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue(null);

      await expect(service.remove(adminUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('concurrency protection (offsetDays uniqueness)', () => {
    it('serializes writers: row lock runs before the campaign guard and stage writes', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue({
        id: 'row-1',
        uuid: 'fus-1',
      });
      tx.followUpSequence.update.mockResolvedValue({
        uuid: 'fus-1',
        name: 'n',
      });

      await service.update(adminUser, 'fus-1', {
        stages: [{ name: 'A', offsetDays: -60, template: 't' }],
      });

      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const readOrder =
        tx.followUpSequence.findFirst.mock.invocationCallOrder[0];
      const guardOrder = tx.campaign.count.mock.invocationCallOrder[0];
      const deleteOrder =
        tx.followUpSequenceStage.updateMany.mock.invocationCallOrder[0];
      const insertOrder =
        tx.followUpSequenceStage.createMany.mock.invocationCallOrder[0];

      expect(lockOrder).toBeLessThan(readOrder);
      expect(readOrder).toBeLessThan(guardOrder);
      expect(guardOrder).toBeLessThan(deleteOrder);
      expect(deleteOrder).toBeLessThan(insertOrder);
    });

    it('runs the campaign usage guard inside the same transaction as the write', async () => {
      tx.followUpSequence.findFirst.mockResolvedValue({
        id: 'row-1',
        uuid: 'fus-1',
      });
      tx.followUpSequence.update.mockResolvedValue({
        uuid: 'fus-1',
        name: 'n',
      });

      await service.remove(adminUser, 'fus-1');

      // Both the guard and the mutation execute within the single $transaction
      // callback (same tx client), so they commit or roll back together.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const guardOrder = tx.campaign.count.mock.invocationCallOrder[0];
      const deleteOrder =
        tx.followUpSequence.update.mock.invocationCallOrder[0];
      expect(guardOrder).toBeLessThan(deleteOrder);
    });
  });
});
