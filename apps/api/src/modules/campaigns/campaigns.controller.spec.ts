import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let service: {
    create: jest.Mock;
    list: jest.Mock;
    detail: jest.Mock;
    update: jest.Mock;
    activate: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
    cancel: jest.Mock;
    previewSegment: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      update: jest.fn(),
      activate: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      cancel: jest.fn(),
      previewSegment: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: service }],
    }).compile();

    controller = module.get(CampaignsController);
  });

  it('protects every endpoint with JwtAuthGuard only (HG-3: all org roles)', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      CampaignsController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(ROLES_KEY, CampaignsController)).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, CampaignsController.prototype, 'create'),
    ).toBeUndefined();
  });

  it('wraps create in the data envelope (201)', async () => {
    service.create.mockResolvedValue({
      uuid: 'cu-1',
      name: 'Campaña',
      status: 'DRAFT',
      organizationId: 'org-1',
      createdAt: new Date(),
    });
    const result = await controller.create(user, {
      name: 'Campaña',
      template: 'Hola {customerName}',
      type: 'MANUAL',
    });
    expect(service.create).toHaveBeenCalledWith(user, {
      name: 'Campaña',
      template: 'Hola {customerName}',
      type: 'MANUAL',
    });
    expect(result).toEqual({
      data: expect.objectContaining({ uuid: 'cu-1' }) as object,
    });
  });

  it('forwards list query to the service', async () => {
    service.list.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
    const result = await controller.list(user, { page: 1, limit: 20 });
    expect(service.list).toHaveBeenCalledWith(user, { page: 1, limit: 20 });
    expect(result).toEqual({ data: [], meta: expect.any(Object) as unknown });
  });

  it('wraps detail in the data envelope', async () => {
    service.detail.mockResolvedValue({ uuid: 'cu-1', template: 't' });
    const result = await controller.detail(user, { uuid: 'cu-1' });
    expect(service.detail).toHaveBeenCalledWith(user, 'cu-1');
    expect(result).toEqual({ data: { uuid: 'cu-1', template: 't' } });
  });

  it('wraps update in the data envelope', async () => {
    service.update.mockResolvedValue({
      uuid: 'cu-1',
      name: 'Nuevo',
      status: 'DRAFT',
    });
    const result = await controller.update(
      user,
      { uuid: 'cu-1' },
      { name: 'Nuevo' },
    );
    expect(service.update).toHaveBeenCalledWith(user, 'cu-1', {
      name: 'Nuevo',
    });
    expect(result).toEqual({
      data: { uuid: 'cu-1', name: 'Nuevo', status: 'DRAFT' },
    });
  });

  it('wraps activate in the data envelope', async () => {
    service.activate.mockResolvedValue({
      uuid: 'cu-1',
      status: 'ACTIVE',
      automationCount: 3,
      startedAt: new Date(),
    });
    const result = await controller.activate(user, { uuid: 'cu-1' });
    expect(service.activate).toHaveBeenCalledWith(user, 'cu-1');
    expect(result).toEqual({
      data: expect.objectContaining({ status: 'ACTIVE' }) as object,
    });
  });

  it('wraps pause in the data envelope', async () => {
    service.pause.mockResolvedValue({ uuid: 'cu-1', status: 'PAUSED' });
    const result = await controller.pause(user, { uuid: 'cu-1' });
    expect(result).toEqual({ data: { uuid: 'cu-1', status: 'PAUSED' } });
  });

  it('wraps resume in the data envelope', async () => {
    service.resume.mockResolvedValue({ uuid: 'cu-1', status: 'ACTIVE' });
    const result = await controller.resume(user, { uuid: 'cu-1' });
    expect(result).toEqual({ data: { uuid: 'cu-1', status: 'ACTIVE' } });
  });

  it('wraps cancel in the data envelope', async () => {
    service.cancel.mockResolvedValue({ uuid: 'cu-1', status: 'CANCELLED' });
    const result = await controller.cancel(user, { uuid: 'cu-1' });
    expect(result).toEqual({ data: { uuid: 'cu-1', status: 'CANCELLED' } });
  });

  it('forwards an optional segment to preview-segment', async () => {
    service.previewSegment.mockResolvedValue({ count: 5 });
    const segment = { city: 'Lima' };
    const result = await controller.previewSegment(
      user,
      { uuid: 'cu-1' },
      segment,
    );
    expect(service.previewSegment).toHaveBeenCalledWith(user, 'cu-1', segment);
    expect(result).toEqual({ data: { count: 5 } });
  });

  it('preview-segment works without a body', async () => {
    service.previewSegment.mockResolvedValue({ count: 0 });
    const result = await controller.previewSegment(
      user,
      { uuid: 'cu-1' },
      undefined,
    );
    expect(service.previewSegment).toHaveBeenCalledWith(
      user,
      'cu-1',
      undefined,
    );
    expect(result).toEqual({ data: { count: 0 } });
  });
});
