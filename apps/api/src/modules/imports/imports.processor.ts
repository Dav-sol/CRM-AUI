import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Customer, Import, Prisma, Product, Purchase } from '@prisma/client';
import { readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { BATCH_SIZE, ERROR_SAMPLE_LIMIT } from './imports.constants';
import { buildImportEvent } from './imports.events';
import {
  parseImportFile,
  ParsedRow,
  RowIssue,
  validateRow,
} from './imports.parser';

const MODULE = 'imports';

function toErrorsJson(
  issues: RowIssue[],
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (issues.length === 0) {
    return Prisma.JsonNull;
  }
  return {
    rows: issues.slice(0, ERROR_SAMPLE_LIMIT),
  } as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class ImportsProcessor {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditIdentityService,
  ) {}

  async process(job: Import, retryRowNumbers?: Set<number>): Promise<void> {
    try {
      await this.run(job, retryRowNumbers);
    } catch (error) {
      this.logger.error(
        `import ${job.uuid} failed unexpectedly`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.finalizeFailed(job, 'unexpected processing error');
    }
  }

  private async run(job: Import, retryRowNumbers?: Set<number>): Promise<void> {
    const started = await this.prisma.import.updateMany({
      where: {
        id: job.id,
        status: {
          in: retryRowNumbers ? ['PENDING', 'PROCESSING'] : ['PENDING'],
        },
      },
      data: {
        status: 'VALIDATING',
        startedAt: new Date(),
        updatedBy: job.userId,
      },
    });
    if (started.count === 0) {
      return;
    }

    await this.auditService.record({
      module: MODULE,
      action: 'import.start',
      outcome: 'success',
      userId: job.userId,
      organizationId: job.organizationId,
      description: `import started type=${job.type} file=${job.fileName}`,
    });

    this.emit('ImportStarted', job.status, job, {
      importId: job.uuid,
      type: job.type,
    });

    const filePath = resolve(process.cwd(), job.filePath);
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      await this.finalizeFailed(job, 'file no longer available');
      return;
    }

    const format = job.filePath.endsWith('.xlsx') ? 'xlsx' : 'csv';
    const parsed = await parseImportFile(buffer, format, job.type);
    if (parsed.issues.length > 0 || parsed.rows.length === 0) {
      await this.failValidation(job, parsed.issues, parsed.rows.length);
      return;
    }

    const rows = retryRowNumbers
      ? parsed.rows.filter((row) => retryRowNumbers.has(row.number))
      : parsed.rows;
    if (rows.length === 0) {
      await this.prisma.import.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          errors: Prisma.JsonNull,
        },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'import.complete',
        outcome: 'success',
        userId: job.userId,
        organizationId: job.organizationId,
        description: `import completed type=${job.type} file=${job.fileName} rows=0`,
      });
      this.emit('ImportCompleted', 'COMPLETED', job, {
        importId: job.uuid,
        type: job.type,
        status: 'COMPLETED',
        totalRecords: parsed.rows.length,
        processedRecords: 0,
        errorRecords: 0,
      });
      return;
    }

    await this.prisma.import.update({
      where: { id: job.id },
      data: {
        totalRecords: parsed.rows.length,
        status: 'PROCESSING',
        updatedBy: job.userId,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.validate',
      outcome: 'success',
      userId: job.userId,
      organizationId: job.organizationId,
      description: `import validated type=${job.type} rows=${parsed.rows.length}`,
    });

    this.emit('ImportValidated', 'PROCESSING', job, {
      importId: job.uuid,
      type: job.type,
      totalRecords: parsed.rows.length,
    });

    const state = await this.createRowState(job);
    const errors: RowIssue[] = [];
    let processed = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        const rowErrors = validateRow(job.type, row);
        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          continue;
        }
        try {
          await this.writeRow(job, state, row);
          processed++;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            job.type === 'PURCHASES'
          ) {
            processed++;
            continue;
          }
          errors.push({
            row: row.number,
            field: '_db',
            message: 'row could not be stored',
            raw: error instanceof Error ? error.message : 'unknown',
          });
        }
      }

      await this.prisma.import.update({
        where: { id: job.id },
        data: {
          processedRecords: processed,
          errorRecords: errors.length,
          errors: toErrorsJson(errors),
          updatedBy: job.userId,
        },
      });

      const current = await this.prisma.import.findFirst({
        where: { id: job.id },
        select: { status: true },
      });
      if (current && current.status !== 'PROCESSING') {
        await this.prisma.import.update({
          where: { id: job.id },
          data: { completedAt: new Date() },
        });
        return;
      }
    }

    const finalStatus = errors.length > 0 ? 'PARTIAL' : 'COMPLETED';
    await this.prisma.import.updateMany({
      where: { id: job.id, status: 'PROCESSING' },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        errors: toErrorsJson(errors),
        updatedBy: job.userId,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.complete',
      outcome: 'success',
      userId: job.userId,
      organizationId: job.organizationId,
      description: `import completed type=${job.type} file=${job.fileName} status=${finalStatus} processed=${processed} errors=${errors.length}`,
    });

    this.emit('ImportCompleted', finalStatus, job, {
      importId: job.uuid,
      type: job.type,
      status: finalStatus,
      totalRecords: parsed.rows.length,
      processedRecords: processed,
      errorRecords: errors.length,
    });
  }

  private async failValidation(
    job: Import,
    issues: RowIssue[],
    totalRecords: number,
  ): Promise<void> {
    await this.prisma.import.updateMany({
      where: { id: job.id, status: 'VALIDATING' },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        totalRecords,
        errors: toErrorsJson(issues),
        updatedBy: job.userId,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.fail',
      outcome: 'failure',
      userId: job.userId,
      organizationId: job.organizationId,
      description: `import validation failed type=${job.type} file=${job.fileName} issues=${issues.length}`,
    });

    this.emit('ImportFailed', 'FAILED', job, {
      importId: job.uuid,
      type: job.type,
      reason: 'validation_failed',
    });
  }

  private async finalizeFailed(job: Import, reason: string): Promise<void> {
    await this.prisma.import.updateMany({
      where: {
        id: job.id,
        status: { in: ['PENDING', 'VALIDATING', 'PROCESSING'] },
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        updatedBy: job.userId,
      },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'import.fail',
      outcome: 'failure',
      userId: job.userId,
      organizationId: job.organizationId,
      description: `import failed type=${job.type} file=${job.fileName} reason=${reason}`,
    });

    this.emit('ImportFailed', 'FAILED', job, {
      importId: job.uuid,
      type: job.type,
      reason,
    });
  }

  private async createRowState(job: Import): Promise<{
    customers: Map<string, { id: string; deletedAt: Date | null }>;
    products: Map<string, { id: string; deletedAt: Date | null }>;
  }> {
    const [customers, products] = await Promise.all([
      this.prisma.customer.findMany({
        where: { organizationId: job.organizationId },
        select: { id: true, codcli: true, deletedAt: true },
      }),
      this.prisma.product.findMany({
        where: { organizationId: job.organizationId },
        select: { id: true, code: true, deletedAt: true },
      }),
    ]);

    return {
      customers: new Map(customers.map((c) => [c.codcli, c])),
      products: new Map(products.map((p) => [p.code, p])),
    };
  }

  private async writeRow(
    job: Import,
    state: {
      customers: Map<string, { id: string; deletedAt: Date | null }>;
      products: Map<string, { id: string; deletedAt: Date | null }>;
    },
    row: ParsedRow,
  ): Promise<void> {
    const cells = row.cells;

    if (job.type === 'CUSTOMERS') {
      const codcli = cells['codcli'] ?? '';
      const existing = state.customers.get(codcli);
      let customer: Customer;
      if (existing) {
        customer = await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: cells['name'] ?? '',
            phone: cells['phone'] ?? null,
            email: cells['email'] ?? null,
            address: cells['address'] ?? null,
            city: cells['city'] ?? null,
            deletedAt: null,
            updatedBy: job.userId,
          },
        });
      } else {
        customer = await this.prisma.customer.create({
          data: {
            organizationId: job.organizationId,
            codcli,
            name: cells['name'] ?? '',
            phone: cells['phone'] ?? null,
            email: cells['email'] ?? null,
            address: cells['address'] ?? null,
            city: cells['city'] ?? null,
            createdBy: job.userId,
          },
        });
        state.customers.set(codcli, { id: customer.id, deletedAt: null });
      }
      this.emit('CustomerImported', 'PROCESSING', job, {
        importId: job.uuid,
        customerId: customer.id,
        codcli,
      });
      return;
    }

    if (job.type === 'PRODUCTS') {
      const code = cells['code'] ?? '';
      const existing = state.products.get(code);
      let product: Product;
      if (existing) {
        product = await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            name: cells['name'] ?? '',
            category: cells['category'] ?? null,
            status: cells['status']
              ? (cells['status'].toUpperCase() as Product['status'])
              : undefined,
            deletedAt: null,
            updatedBy: job.userId,
          },
        });
      } else {
        product = await this.prisma.product.create({
          data: {
            organizationId: job.organizationId,
            code,
            name: cells['name'] ?? '',
            category: cells['category'] ?? null,
            status: cells['status']
              ? (cells['status'].toUpperCase() as Product['status'])
              : undefined,
            createdBy: job.userId,
          },
        });
        state.products.set(code, { id: product.id, deletedAt: null });
      }
      this.emit('ProductImported', 'PROCESSING', job, {
        importId: job.uuid,
        productId: product.id,
        code,
      });
      return;
    }

    const customer = state.customers.get(cells['codcli'] ?? '');
    const product = state.products.get(cells['code'] ?? '');
    if (!customer || !product) {
      throw new Error('unresolved customer or product');
    }

    const purchase = await this.prisma.purchase.create({
      data: {
        organizationId: job.organizationId,
        customerId: customer.id,
        productId: product.id,
        invoiceNumber: cells['invoiceNumber'] ?? '',
        purchaseDate: new Date(cells['purchaseDate'] ?? ''),
        quantity: Number(cells['quantity'] ?? '0'),
        value: new Prisma.Decimal(cells['value'] ?? '0'),
        status: cells['status']
          ? (cells['status'].toUpperCase() as Purchase['status'])
          : undefined,
        createdBy: job.userId,
      },
    });
    this.emit('PurchaseImported', 'PROCESSING', job, {
      importId: job.uuid,
      purchaseId: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
    });
  }

  private emit<T>(
    event: string,
    state: Import['status'],
    job: Import,
    payload: T,
  ): void {
    this.eventEmitter.emit(
      event,
      buildImportEvent<T>(state, job.userId, job.organizationId, payload),
    );
  }

  async purgeExpiredFiles(days: number): Promise<number> {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const jobs = await this.prisma.import.findMany({
      where: { deletedAt: null, createdAt: { lt: threshold } },
      select: { id: true, filePath: true },
      take: 100,
    });
    let purged = 0;
    for (const job of jobs) {
      try {
        await unlink(resolve(process.cwd(), job.filePath));
        purged++;
      } catch {
        this.logger.warn(`could not purge file for import ${job.id}`);
      }
    }
    return purged;
  }
}
