import { Test, TestingModule } from '@nestjs/testing';
import { ConfiguracionesService } from './configuraciones.service';
import { ConfiguracionesController } from './configuraciones.controller';

const orgUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
} as never;

const platformUser = {
  id: 'u-9',
  uuid: 'uu-9',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
} as never;

describe('ConfiguracionesController', () => {
  let controller: ConfiguracionesController;
  let service: {
    requireOrganizationId: jest.Mock;
    horarios: jest.Mock;
    parametros: jest.Mock;
    updateHorarios: jest.Mock;
    updateParametros: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      requireOrganizationId: jest.fn().mockReturnValue('org-1'),
      horarios: jest.fn().mockResolvedValue({
        businessHoursEnabled: false,
        timezone: 'America/Bogota',
        businessDays: ['MON'],
        businessHoursStart: null,
        businessHoursEnd: null,
      }),
      parametros: jest.fn().mockResolvedValue({
        quoteExpiryDays: { valor: 7, source: 'default' },
      }),
      updateHorarios: jest.fn().mockResolvedValue({
        businessHoursEnabled: true,
      }),
      updateParametros: jest.fn().mockResolvedValue({
        quoteExpiryDays: { valor: 10, source: 'db' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfiguracionesController],
      providers: [{ provide: ConfiguracionesService, useValue: service }],
    }).compile();

    controller = module.get<ConfiguracionesController>(
      ConfiguracionesController,
    );
  });

  it('reads the schedule of the organization of the JWT', async () => {
    const result = await controller.horarios(orgUser);

    expect(service.requireOrganizationId).toHaveBeenCalledWith(orgUser);
    expect(service.horarios).toHaveBeenCalledWith('org-1');
    expect(result.data.businessHoursEnabled).toBe(false);
  });

  it('reads the parameters with their origin', async () => {
    const result = await controller.parametros(orgUser);

    expect(service.parametros).toHaveBeenCalledWith('org-1');
    expect(result.data.quoteExpiryDays).toEqual({
      valor: 7,
      source: 'default',
    });
  });

  it('updates the schedule through the service with the user', async () => {
    await controller.updateHorarios(orgUser, { businessHoursEnabled: true });

    expect(service.updateHorarios).toHaveBeenCalledWith(orgUser, {
      businessHoursEnabled: true,
    });
  });

  it('updates the parameters through the service with the user', async () => {
    const result = await controller.updateParametros(orgUser, {
      quoteExpiryDays: 10,
    });

    expect(service.updateParametros).toHaveBeenCalledWith(orgUser, {
      quoteExpiryDays: 10,
    });
    expect(result.data.quoteExpiryDays.source).toBe('db');
  });

  it('a platform account has no organization to configure', async () => {
    service.requireOrganizationId.mockImplementation(() => {
      throw new Error('Configuración requiere una organización');
    });

    await expect(controller.horarios(platformUser)).rejects.toThrow(
      'Configuración requiere una organización',
    );
  });
});
