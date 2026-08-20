import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { ImportsService } from './imports.service';
import { ImportsProcessor } from './imports.processor';
import { FileValidatorService } from './file-validator.service';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

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

const job = {
  id: 'i-1',
  uuid: 'job-1',
  organizationId: 'org-1',
  userId: 'u-1',
  type: 'CUSTOMERS',
  fileName: 'clientes.csv',
  filePath: 'uploads/org-org-1/x.csv',
  fileHash: 'abc',
  idempotencyKey: null,
  status: 'PENDING',
  totalRecords: 0,
  processedRecords: 0,
  errorRecords: 0,
  errors: null,
  startedAt: null,
  completedAt: null,
  createdBy: 'u-1',
  updatedBy: null,
  deletedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const file = {
  originalname: 'clientes.csv',
  mimetype: 'text/csv',
  size: 12,
  buffer: Buffer.from('codcli,name\nA1,Juan'),
} as Express.Multer.File;

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: {
    import: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    organization: { findUnique: jest.Mock };
  };
  let auditService: { record: jest.Mock };
  let fileValidator: { validateFormat: jest.Mock };
  let processor: { process: jest.Mock };

  beforeEach(async () => {
    prisma = {
      import: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: { findUnique: jest.fn() },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    fileValidator = { validateFormat: jest.fn().mockReturnValue('csv') };
    processor = { process: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: FileValidatorService, useValue: fileValidator },
        { provide: ImportsProcessor, useValue: processor },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
  });

  describe('create (US1/US10)', () => {
    it('creates a pending job, persists the file and schedules processing', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.create.mockResolvedValue(job);

      const result = await service.create(orgUser, { type: 'CUSTOMERS' }, file);

      expect(result.created).toBe(true);
      expect(result.job.status).toBe('PENDING');
      expect(prisma.import.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'u-1',
          type: 'CUSTOMERS',
          status: 'PENDING',
          fileHash: expect.any(String) as string,
          createdBy: 'u-1',
        }) as object,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import.create',
          outcome: 'success',
        }),
      );
      expect(processor.process).toHaveBeenCalledWith(job);
    });

    it('rejects a missing file with 400', async () => {
      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, undefined as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an oversized file with 413', async () => {
      fileValidator.validateFormat.mockImplementation(() => {
        throw new Error('FILE_TOO_LARGE');
      });
      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('rejects an unsupported format with 415', async () => {
      fileValidator.validateFormat.mockImplementation(() => {
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
      });
      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('rejects a duplicate file with 409 DUPLICATE_FILE (IM-005)', async () => {
      prisma.import.findFirst.mockResolvedValue(job);
      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(ConflictException);
    });

    it('maps a P2002 race on create to 409 DUPLICATE_FILE without a key', async () => {
      prisma.import.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(job);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );

      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(ConflictException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import.create',
          outcome: 'failure',
        }),
      );
    });

    it('maps a P2002 race on create to a replay when the key matches', async () => {
      prisma.import.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(job);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '6.16.2',
        }),
      );

      const result = await service.create(
        orgUser,
        { type: 'CUSTOMERS' },
        file,
        'key-1',
      );

      expect(result.created).toBe(false);
      expect(result.job.uuid).toBe('job-1');
    });

    it('replays the existing job when the Idempotency-Key matches', async () => {
      prisma.import.findFirst.mockResolvedValueOnce(job);
      prisma.import.count.mockResolvedValue(0);

      const result = await service.create(
        orgUser,
        { type: 'CUSTOMERS' },
        file,
        'key-1',
      );

      expect(result.created).toBe(false);
      expect(result.job.uuid).toBe('job-1');
      expect(prisma.import.create).not.toHaveBeenCalled();
    });

    it('rejects a second active job of the same type with 409 (HG-16)', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      prisma.import.count.mockResolvedValue(1);
      await expect(
        service.create(orgUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects organizationId from an ORGANIZATION user with 400', async () => {
      await expect(
        service.create(
          orgUser,
          { type: 'CUSTOMERS', organizationId: 'org-2' },
          file,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires organizationId for PLATFORM_OWNER', async () => {
      await expect(
        service.create(platformUser, { type: 'CUSTOMERS' }, file),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown organization for PLATFORM_OWNER', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          platformUser,
          { type: 'CUSTOMERS', organizationId: 'org-x' },
          file,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll (US6)', () => {
    it('scopes to the organization user and returns pagination meta', async () => {
      prisma.import.count.mockResolvedValue(1);
      prisma.import.findMany.mockResolvedValue([job]);

      const result = await service.findAll(orgUser, {});

      expect(prisma.import.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          deletedAt: null,
          organizationId: 'org-1',
        }) as object,
      });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
      expect(result.data[0].errorsSummary).toEqual({ total: 0, samples: [] });
    });

    it('applies type/status/date filters and search', async () => {
      prisma.import.count.mockResolvedValue(0);
      prisma.import.findMany.mockResolvedValue([]);

      await service.findAll(orgUser, {
        type: 'PRODUCTS',
        status: 'PARTIAL',
        search: 'productos',
        createdFrom: '2026-08-01',
        createdTo: '2026-08-14',
        sort: '-createdAt',
      });

      expect(prisma.import.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'PRODUCTS',
            status: 'PARTIAL',
            fileName: { contains: 'productos', mode: 'insensitive' },
          }) as object,
        }),
      );
    });

    it('rejects an invalid sort field', async () => {
      await expect(
        service.findAll(orgUser, { sort: 'fileHash' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById (US6)', () => {
    it('returns the summary for an existing job', async () => {
      prisma.import.findFirst.mockResolvedValue(job);
      const result = await service.findById(orgUser, 'job-1');
      expect(result?.uuid).toBe('job-1');
    });

    it('returns null for a missing job', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      await expect(service.findById(orgUser, 'job-x')).resolves.toBeNull();
    });
  });

  describe('cancel (US8)', () => {
    it('cancels an active job and audits', async () => {
      prisma.import.findFirst.mockResolvedValue(job);
      prisma.import.update.mockResolvedValue({ ...job, status: 'CANCELLED' });

      await service.cancel(orgUser, 'job-1');

      expect(prisma.import.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: {
          status: 'CANCELLED',
          completedAt: expect.any(Date) as Date,
          updatedBy: 'u-1',
        },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import.cancel',
          outcome: 'success',
        }),
      );
    });

    it('returns 404 for a cross-tenant or unknown job', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      await expect(service.cancel(orgUser, 'job-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects cancel of a final-state job', async () => {
      prisma.import.findFirst.mockResolvedValue({
        ...job,
        status: 'COMPLETED',
      });
      await expect(service.cancel(orgUser, 'job-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('retry (US9)', () => {
    it('retries a PARTIAL job reprocessing only error rows', async () => {
      const partial = {
        ...job,
        status: 'PARTIAL',
        errors: { rows: [{ row: 3, field: 'codcli', message: 'x' }] },
      };
      prisma.import.findFirst.mockResolvedValue(partial);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.update.mockResolvedValue({
        ...partial,
        status: 'PROCESSING',
      });

      await service.retry(orgUser, 'job-1');

      expect(processor.process).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'i-1' }),
        new Set([3]),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'import.retry', outcome: 'success' }),
      );
    });

    it('retries a FAILED job reprocessing the whole file', async () => {
      const failed = { ...job, status: 'FAILED', errors: null };
      prisma.import.findFirst.mockResolvedValue(failed);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.update.mockResolvedValue({ ...failed, status: 'PENDING' });

      await service.retry(orgUser, 'job-1');

      expect(prisma.import.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(processor.process).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'i-1' }),
        undefined,
      );
    });

    it('rejects retry of a COMPLETED job', async () => {
      prisma.import.findFirst.mockResolvedValue({
        ...job,
        status: 'COMPLETED',
      });
      await expect(service.retry(orgUser, 'job-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects retry while another job of the same type is active', async () => {
      prisma.import.findFirst.mockResolvedValue({ ...job, status: 'FAILED' });
      prisma.import.count.mockResolvedValue(1);
      await expect(service.retry(orgUser, 'job-1')).rejects.toThrow(
        ConflictException,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import.retry',
          outcome: 'failure',
        }),
      );
    });
  });
});
