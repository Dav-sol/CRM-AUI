import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: {
    summary: jest.Mock;
    campaigns: jest.Mock;
    activity: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      summary: jest.fn(),
      campaigns: jest.fn(),
      activity: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    }).compile();

    controller = module.get(DashboardController);
  });

  it('protects every endpoint with JwtAuthGuard only (all org roles)', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      DashboardController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(ROLES_KEY, DashboardController)).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, DashboardController.prototype, 'summary'),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        DashboardController.prototype,
        'campaigns',
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(ROLES_KEY, DashboardController.prototype, 'activity'),
    ).toBeUndefined();
  });

  it('wraps summary in the data envelope', async () => {
    service.summary.mockResolvedValue({ customers: { total: 1 } });
    const result = await controller.summary(user);
    expect(service.summary).toHaveBeenCalledWith(user);
    expect(result).toEqual({
      data: expect.objectContaining({ customers: { total: 1 } }) as object,
    });
  });

  it('wraps campaigns in the data envelope', async () => {
    service.campaigns.mockResolvedValue({ recent: [], upcoming: [] });
    const result = await controller.campaigns(user);
    expect(service.campaigns).toHaveBeenCalledWith(user);
    expect(result).toEqual({ data: { recent: [], upcoming: [] } });
  });

  it('wraps activity in the data envelope', async () => {
    service.activity.mockResolvedValue([]);
    const result = await controller.activity(user);
    expect(service.activity).toHaveBeenCalledWith(user);
    expect(result).toEqual({ data: [] });
  });
});
