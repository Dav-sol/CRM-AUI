import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

describe('PurchasesController', () => {
  let controller: PurchasesController;
  let service: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchasesController],
      providers: [{ provide: PurchasesService, useValue: service }],
    }).compile();

    controller = module.get<PurchasesController>(PurchasesController);
  });

  it('returns the paginated list envelope from the service', async () => {
    service.findAll.mockResolvedValue({
      data: [{ id: 'p-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.findAll(user, { page: 1 });

    expect(service.findAll).toHaveBeenCalledWith(user, { page: 1 });
    expect(result).toEqual({
      data: [{ id: 'p-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('returns the purchase found by id', async () => {
    service.findById.mockResolvedValue({ id: 'p-1' });

    const result = await controller.findOne(user, 'p-1');

    expect(service.findById).toHaveBeenCalledWith(user, 'p-1');
    expect(result).toEqual({ data: { id: 'p-1' } });
  });

  it('throws PURCHASE_NOT_FOUND when the purchase does not exist', async () => {
    service.findById.mockResolvedValue(null);

    await expect(controller.findOne(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wraps create/update results in the data envelope', async () => {
    service.create.mockResolvedValue({ id: 'p-1' });
    service.update.mockResolvedValue({ id: 'p-1' });

    await expect(
      controller.create(user, {
        customerId: 'c-1',
        productId: 'p-1',
        invoiceNumber: 'INV-0001',
        purchaseDate: '2026-07-22T14:35:18Z',
        quantity: 1,
        value: '10.00',
      }),
    ).resolves.toEqual({
      data: { id: 'p-1' },
    });
    await expect(
      controller.update(user, 'p-1', { status: 'CANCELLED' }),
    ).resolves.toEqual({
      data: { id: 'p-1' },
    });
  });

  it('restricts write handlers with the write roles and no remove route', () => {
    const proto = PurchasesController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;
    const createHandler = proto['create'];
    const updateHandler = proto['update'];
    const readHandler = proto['findAll'];
    const removeHandler = proto['remove'];

    const createRoles: unknown = Reflect.getMetadata(ROLES_KEY, createHandler);
    const updateRoles: unknown = Reflect.getMetadata(ROLES_KEY, updateHandler);
    const readRoles: unknown = Reflect.getMetadata(ROLES_KEY, readHandler);

    expect(createRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);
    expect(updateRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);
    expect(readRoles).toBeUndefined();
    expect(removeHandler).toBeUndefined();
  });
});
