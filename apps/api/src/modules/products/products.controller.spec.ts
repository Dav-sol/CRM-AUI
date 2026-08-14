import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('returns the paginated list envelope from the service', async () => {
    service.findAll.mockResolvedValue({
      data: [{ id: 'pr-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.findAll(user, { page: 1 });

    expect(service.findAll).toHaveBeenCalledWith(user, { page: 1 });
    expect(result).toEqual({
      data: [{ id: 'pr-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('returns the product found by id', async () => {
    service.findById.mockResolvedValue({ id: 'pr-1' });

    const result = await controller.findOne(user, 'pr-1');

    expect(service.findById).toHaveBeenCalledWith(user, 'pr-1');
    expect(result).toEqual({ data: { id: 'pr-1' } });
  });

  it('throws PRODUCT_NOT_FOUND when the product does not exist', async () => {
    service.findById.mockResolvedValue(null);

    await expect(controller.findOne(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wraps create/update results in the data envelope', async () => {
    service.create.mockResolvedValue({ id: 'pr-1' });
    service.update.mockResolvedValue({ id: 'pr-1' });

    await expect(
      controller.create(user, { code: 'P-100', name: 'Batería X' }),
    ).resolves.toEqual({
      data: { id: 'pr-1' },
    });
    await expect(
      controller.update(user, 'pr-1', { status: 'INACTIVE' }),
    ).resolves.toEqual({
      data: { id: 'pr-1' },
    });
  });

  it('returns the success shape for soft delete', async () => {
    service.remove.mockResolvedValue({ id: 'pr-1' });

    await expect(controller.remove(user, 'pr-1')).resolves.toEqual({
      data: { success: true },
    });
    expect(service.remove).toHaveBeenCalledWith(user, 'pr-1');
  });

  it('restricts all write handlers with the write roles', () => {
    const proto = ProductsController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;
    const createHandler = proto['create'];
    const updateHandler = proto['update'];
    const removeHandler = proto['remove'];
    const readHandler = proto['findAll'];

    const createRoles: unknown = Reflect.getMetadata(ROLES_KEY, createHandler);
    const updateRoles: unknown = Reflect.getMetadata(ROLES_KEY, updateHandler);
    const removeRoles: unknown = Reflect.getMetadata(ROLES_KEY, removeHandler);
    const readRoles: unknown = Reflect.getMetadata(ROLES_KEY, readHandler);

    expect(createRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);
    expect(updateRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);
    expect(removeRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);
    expect(readRoles).toBeUndefined();
  });
});
