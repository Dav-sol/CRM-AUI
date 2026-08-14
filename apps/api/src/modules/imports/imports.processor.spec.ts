import { EventEmitter2 } from '@nestjs/event-emitter';
import { Import, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { ImportsProcessor } from './imports.processor';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { readFile } from 'fs/promises';

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
} as unknown as Import;

function csvJob(type: string, filePath: string): Import {
  return { ...job, type, filePath } as unknown as Import;
}

describe('ImportsProcessor', () => {
  let processor: ImportsProcessor;
  let prisma: {
    import: {
      updateMany: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    customer: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    product: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    purchase: { create: jest.Mock };
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    prisma = {
      import: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => ({
            ...job,
            ...args.data,
          })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      purchase: { create: jest.fn() },
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    processor = new ImportsProcessor(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
      auditService as unknown as AuditIdentityService,
    );
  });

  describe('validation phase (US2)', () => {
    it('fails the job with structural errors when required columns are missing', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('factura,codcli\nF1,C1\n'),
      );

      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));

      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }) as object,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'import.fail', outcome: 'failure' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ImportFailed',
        expect.objectContaining({
          payload: expect.objectContaining({
            reason: 'validation_failed',
          }) as object,
        }),
      );
    });

    it('fails the job when the file is empty', async () => {
      (readFile as jest.Mock).mockResolvedValue(Buffer.from(''));
      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));
      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }) as object,
        }),
      );
    });
  });

  describe('customer import (US3)', () => {
    it('creates new customers and emits row events', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('codcli,name,phone\nC1,Juan,099\nC2,Ana,\n'),
      );
      prisma.customer.create
        .mockResolvedValueOnce({ id: 'c-1', codcli: 'C1' })
        .mockResolvedValueOnce({ id: 'c-2', codcli: 'C2' });

      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));

      expect(prisma.customer.create).toHaveBeenCalledTimes(2);
      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            codcli: 'C1',
            phone: '099',
            createdBy: 'u-1',
          }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'CustomerImported',
        expect.objectContaining({
          payload: expect.objectContaining({
            customerId: 'c-1',
            codcli: 'C1',
          }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ImportCompleted',
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'COMPLETED',
            processedRecords: 2,
            errorRecords: 0,
          }) as object,
        }),
      );
      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }) as object,
        }),
      );
    });

    it('updates an existing customer and clears its soft delete', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('codcli,name,phone\nC1,Nuevo,099\n'),
      );
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', codcli: 'C1', deletedAt: new Date() },
      ]);
      prisma.customer.update.mockResolvedValue({ id: 'c-1', codcli: 'C1' });

      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));

      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: expect.objectContaining({
          name: 'Nuevo',
          phone: '099',
          deletedAt: null,
          updatedBy: 'u-1',
        }) as object,
      });
    });

    it('records a row error when a required field is missing (IM-006)', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('codcli,name\nC1,Juan\n,SinNombre\n'),
      );
      prisma.customer.create.mockResolvedValue({ id: 'c-1', codcli: 'C1' });

      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));

      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PARTIAL' }) as object,
        }),
      );
      expect(prisma.import.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorRecords: 1 }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ImportCompleted',
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'PARTIAL' }) as object,
        }),
      );
    });
  });

  describe('product import (US4)', () => {
    it('creates products by code and updates existing ones', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from(
          'code,name,category\nP1,Producto A,Taller\nP2,Producto B,\n',
        ),
      );
      prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', code: 'P1', deletedAt: null },
      ]);
      prisma.product.update.mockResolvedValue({ id: 'p-1' });
      prisma.product.create.mockResolvedValue({ id: 'p-2' });

      await processor.process(csvJob('PRODUCTS', 'uploads/x.csv'));

      expect(prisma.product.update).toHaveBeenCalledTimes(1);
      expect(prisma.product.create).toHaveBeenCalledTimes(1);
      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'P2',
            createdBy: 'u-1',
          }) as object,
        }),
      );
    });
  });

  describe('purchase import (US5)', () => {
    it('creates purchases resolving customer and product by natural key', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from(
          'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,C1,P1,2026-08-01,2,150.50\n',
        ),
      );
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', codcli: 'C1', deletedAt: null },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', code: 'P1', deletedAt: null },
      ]);
      prisma.purchase.create.mockResolvedValue({ id: 'pu-1' });

      await processor.process(csvJob('PURCHASES', 'uploads/x.csv'));

      expect(prisma.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            customerId: 'c-1',
            productId: 'p-1',
            invoiceNumber: 'F-1',
            quantity: 2,
            value: new Prisma.Decimal('150.50'),
            createdBy: 'u-1',
          }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'PurchaseImported',
        expect.objectContaining({
          payload: expect.objectContaining({ purchaseId: 'pu-1' }) as object,
        }),
      );
    });

    it('skips duplicate tuples via P2002 and still completes (CP-005)', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from(
          'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,C1,P1,2026-08-01,2,150.50\n',
        ),
      );
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', codcli: 'C1', deletedAt: null },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', code: 'P1', deletedAt: null },
      ]);
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
      });
      prisma.purchase.create.mockRejectedValue(p2002);

      await processor.process(csvJob('PURCHASES', 'uploads/x.csv'));

      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }) as object,
        }),
      );
    });

    it('records a row error when the customer cannot be resolved (HG-7)', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from(
          'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,MISSING,P1,2026-08-01,2,150.50\n',
        ),
      );
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', code: 'P1', deletedAt: null },
      ]);

      await processor.process(csvJob('PURCHASES', 'uploads/x.csv'));

      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PARTIAL' }) as object,
        }),
      );
      expect(prisma.import.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorRecords: 1 }) as object,
        }),
      );
    });

    it('rejects quantities above int4 max as row errors', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from(
          'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,C1,P1,2026-08-01,99999999999,150.50\n',
        ),
      );
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c-1', codcli: 'C1', deletedAt: null },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p-1', code: 'P1', deletedAt: null },
      ]);

      await processor.process(csvJob('PURCHASES', 'uploads/x.csv'));

      expect(prisma.purchase.create).not.toHaveBeenCalled();
      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PARTIAL' }) as object,
        }),
      );
      expect(prisma.import.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ errorRecords: 1 }) as object,
        }),
      );
    });
  });

  describe('retry (US9)', () => {
    it('reprocesses only the rows previously in error', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('codcli,name\nC1,Juan\nC2,Ana\nC3,Lu\n'),
      );
      prisma.customer.create.mockResolvedValueOnce({ id: 'c-3', codcli: 'C3' });

      await processor.process(
        csvJob('CUSTOMERS', 'uploads/x.csv'),
        new Set([4]),
      );

      expect(prisma.customer.create).toHaveBeenCalledTimes(1);
      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ codcli: 'C3' }) as object,
        }),
      );
      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }) as object,
        }),
      );
    });
  });

  describe('cancel (US8)', () => {
    it('stops processing when the job is cancelled between batches', async () => {
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('codcli,name\nC1,Juan\nC2,Ana\n'),
      );
      prisma.customer.create.mockResolvedValue({ id: 'c-1', codcli: 'C1' });
      prisma.import.findFirst.mockResolvedValue({ status: 'CANCELLED' });

      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));

      expect(prisma.import.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }) as object,
        }),
      );
      expect(prisma.import.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { completedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('unexpected failures (US12)', () => {
    it('fails the job when parsing throws', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('disk'));
      await processor.process(csvJob('CUSTOMERS', 'uploads/x.csv'));
      expect(prisma.import.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }) as object,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ImportFailed',
        expect.anything(),
      );
    });
  });

  describe('purge (FR-023)', () => {
    it('purges expired files', async () => {
      prisma.import.findMany.mockResolvedValue([
        { id: 'i-1', filePath: 'uploads/x.csv' },
      ]);
      await processor.purgeExpiredFiles(30);
      expect(prisma.import.findMany).toHaveBeenCalled();
    });
  });
});
