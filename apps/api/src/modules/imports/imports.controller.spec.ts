import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const summary = {
  uuid: 'job-1',
  type: 'CUSTOMERS',
  status: 'PENDING',
  fileName: 'clientes.csv',
  totalRecords: 0,
  processedRecords: 0,
  errorRecords: 0,
  errorsSummary: { total: 0, samples: [] },
  startedAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ImportsController', () => {
  let controller: ImportsController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    cancel: jest.Mock;
    retry: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      cancel: jest.fn(),
      retry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [{ provide: ImportsService, useValue: service }],
    }).compile();

    controller = module.get<ImportsController>(ImportsController);
  });

  it('returns 201 when a job is created', async () => {
    service.create.mockResolvedValue({ job: summary, created: true });
    const res = { status: jest.fn() };
    const result = await controller.create(
      orgUser,
      { originalname: 'a.csv' } as Express.Multer.File,
      undefined,
      { type: 'CUSTOMERS' },
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(result).toEqual({ data: summary });
  });

  it('returns 200 when the job is replayed via Idempotency-Key', async () => {
    service.create.mockResolvedValue({ job: summary, created: false });
    const res = { status: jest.fn() };
    await controller.create(
      orgUser,
      { originalname: 'a.csv' } as Express.Multer.File,
      'key-1',
      { type: 'CUSTOMERS' },
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('delegates list and detail queries', async () => {
    service.findAll.mockResolvedValue({ data: [], meta: {} });
    await controller.findAll(orgUser, { page: 1 });
    expect(service.findAll).toHaveBeenCalledWith(orgUser, { page: 1 });

    service.findById.mockResolvedValue(summary);
    await controller.findOne(orgUser, { uuid: 'job-1' });
    expect(service.findById).toHaveBeenCalledWith(orgUser, 'job-1');
  });

  it('maps a missing job to 404 IMPORT_NOT_FOUND', async () => {
    service.findById.mockResolvedValue(null);
    await expect(
      controller.findOne(orgUser, { uuid: 'job-x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('delegates cancel and retry', async () => {
    service.cancel.mockResolvedValue(summary);
    const cancel = await controller.cancel(orgUser, { uuid: 'job-1' });
    expect(cancel.data.status).toBe('CANCELLED');

    service.retry.mockResolvedValue({ ...summary, status: 'PROCESSING' });
    const retry = await controller.retry(orgUser, { uuid: 'job-1' });
    expect(retry.data.status).toBe('PROCESSING');
  });
});
