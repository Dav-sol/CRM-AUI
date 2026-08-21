import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { FollowUpSequencesController } from './follow-up-sequences.controller';
import { FollowUpSequencesService } from './follow-up-sequences.service';

const admin: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

const operador: AuthUser = {
  id: 'u-3',
  uuid: 'uu-3',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

describe('FollowUpSequencesController', () => {
  let controller: FollowUpSequencesController;
  let service: {
    create: jest.Mock;
    list: jest.Mock;
    detail: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      detail: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FollowUpSequencesController],
      providers: [{ provide: FollowUpSequencesService, useValue: service }],
    }).compile();

    controller = module.get<FollowUpSequencesController>(
      FollowUpSequencesController,
    );
  });

  it('wraps the created sequence in the data envelope', async () => {
    service.create.mockResolvedValue({ uuid: 'fus-1', name: 'A' });

    const body = {
      name: 'A',
      warrantyMonths: 12 as const,
      stages: [{ name: 'D0', offsetDays: -30, template: 't' }],
    };

    await expect(controller.create(admin, body)).resolves.toEqual({
      data: { uuid: 'fus-1', name: 'A' },
    });
    expect(service.create).toHaveBeenCalledWith(admin, body);
  });

  it('returns the paginated list from the service untouched (data + meta)', async () => {
    const page = {
      data: [{ uuid: 'fus-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    };
    service.list.mockResolvedValue(page);

    await expect(controller.list(operador, {})).resolves.toBe(page);
    expect(service.list).toHaveBeenCalledWith(operador, {});
  });

  it('returns the detail wrapped in the data envelope', async () => {
    service.detail.mockResolvedValue({ uuid: 'fus-1', stages: [] });

    await expect(controller.detail(admin, { uuid: 'fus-1' })).resolves.toEqual({
      data: { uuid: 'fus-1', stages: [] },
    });
  });

  it('propagates NOT_FOUND from detail for unknown or cross-tenant sequences', async () => {
    service.detail.mockRejectedValue(
      new NotFoundException({
        error: {
          code: 'FOLLOW_UP_SEQUENCE_NOT_FOUND',
          message: 'Sequence not found',
        },
      }),
    );

    await expect(
      controller.detail(admin, { uuid: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('wraps update and delete results in the data envelope', async () => {
    service.update.mockResolvedValue({ uuid: 'fus-1', name: 'B' });
    service.remove.mockResolvedValue({ uuid: 'fus-1', success: true });

    await expect(
      controller.update(admin, { uuid: 'fus-1' }, { name: 'B' }),
    ).resolves.toEqual({ data: { uuid: 'fus-1', name: 'B' } });
    await expect(controller.remove(admin, { uuid: 'fus-1' })).resolves.toEqual({
      data: { uuid: 'fus-1', success: true },
    });
  });

  it('restricts writes to ADMINISTRADOR/GERENTE and leaves reads open (HG-FUS-01)', () => {
    const proto = FollowUpSequencesController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;

    const writeRoles = ['create', 'update', 'remove'].map((handler) =>
      Reflect.getMetadata(ROLES_KEY, proto[handler]),
    );
    const readRoles = ['list', 'detail'].map((handler) =>
      Reflect.getMetadata(ROLES_KEY, proto[handler]),
    );

    expect(writeRoles).toEqual([
      ['ADMINISTRADOR', 'GERENTE'],
      ['ADMINISTRADOR', 'GERENTE'],
      ['ADMINISTRADOR', 'GERENTE'],
    ]);
    expect(readRoles).toEqual([undefined, undefined]);
  });
});
