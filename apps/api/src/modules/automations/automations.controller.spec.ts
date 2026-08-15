import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

describe('AutomationsController', () => {
  let controller: AutomationsController;
  let service: {
    listCycles: jest.Mock;
    getCycle: jest.Mock;
    listAutomations: jest.Mock;
    getAutomation: jest.Mock;
    cancelAutomation: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listCycles: jest.fn(),
      getCycle: jest.fn(),
      listAutomations: jest.fn(),
      getAutomation: jest.fn(),
      cancelAutomation: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationsController],
      providers: [{ provide: AutomationsService, useValue: service }],
    }).compile();

    controller = module.get<AutomationsController>(AutomationsController);
  });

  it('returns the paginated cycle list envelope', async () => {
    service.listCycles.mockResolvedValue({
      data: [{ uuid: 'cc-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.listCycles(user, {});

    expect(service.listCycles).toHaveBeenCalledWith(user, {});
    expect(result).toEqual({
      data: [{ uuid: 'cc-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('returns the cycle detail found by uuid', async () => {
    service.getCycle.mockResolvedValue({ uuid: 'cc-1', automations: [] });

    const result = await controller.getCycle(user, { uuid: 'cc-1' });

    expect(service.getCycle).toHaveBeenCalledWith(user, 'cc-1');
    expect(result).toEqual({ data: { uuid: 'cc-1', automations: [] } });
  });

  it('throws COMMERCIAL_CYCLE_NOT_FOUND when the cycle does not exist', async () => {
    service.getCycle.mockResolvedValue(null);

    await expect(
      controller.getCycle(user, { uuid: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the paginated automation list envelope', async () => {
    service.listAutomations.mockResolvedValue({
      data: [{ uuid: 'au-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.listAutomations(user, {});

    expect(service.listAutomations).toHaveBeenCalledWith(user, {});
    expect(result).toEqual({
      data: [{ uuid: 'au-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('throws AUTOMATION_NOT_FOUND when the automation does not exist', async () => {
    service.getAutomation.mockResolvedValue(null);

    await expect(
      controller.getAutomation(user, { uuid: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the success shape for cancelling an automation', async () => {
    service.cancelAutomation.mockResolvedValue({
      uuid: 'au-1',
      status: 'CANCELLED',
    });

    const result = await controller.cancelAutomation(user, {
      uuid: 'au-1',
    });

    expect(service.cancelAutomation).toHaveBeenCalledWith(user, {
      uuid: 'au-1',
    });
    expect(result).toEqual({
      data: { uuid: 'au-1', status: 'CANCELLED', success: true },
    });
  });

  it('restricts the cancel handler with the write roles and leaves reads open', () => {
    const proto = AutomationsController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;

    const cancelRoles: unknown = Reflect.getMetadata(
      ROLES_KEY,
      proto['cancelAutomation'],
    );
    expect(cancelRoles).toEqual(['PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE']);

    for (const readHandler of [
      'listCycles',
      'getCycle',
      'listAutomations',
      'getAutomation',
    ]) {
      expect(
        Reflect.getMetadata(ROLES_KEY, proto[readHandler]),
      ).toBeUndefined();
    }
  });
});
