import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { RolesGuard } from '../../core/guards/roles.guard';
import { TenantScopeGuard } from '../../core/guards/tenant-scope.guard';
import { ConfiguracionesController } from './configuraciones.controller';

/**
 * Los endpoints de configuración están restringidos a ADMINISTRADOR y
 * PLATFORM_OWNER (specs/024-configuraciones-v1 §4). Estos tests fijan el
 * cableado de guards, no solo el comportamiento del servicio.
 */
describe('ConfiguracionesController: permisos', () => {
  const controllerClass = ConfiguracionesController;
  /**
   * Handler de referencia. El guard solo lee los metadatos del reflector, así
   * que alcanza con un sustituto: tomar `prototype.horarios` dispara
   * `unbound-method` sin añadir comportamiento.
   */
  const horariosHandler = () => undefined;

  const rolesGuardContext = (role: string) =>
    ({
      getHandler: () => horariosHandler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { accountType: 'ORGANIZATION', organizationId: 'org-1', role },
        }),
      }),
    }) as never;

  const tenantContext = (
    organizationId: string,
    params: Record<string, string>,
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: { accountType: 'ORGANIZATION', organizationId },
          params,
        }),
      }),
    }) as never;

  it('declara PLATFORM_OWNER y ADMINISTRADOR a nivel de clase', () => {
    expect(Reflect.getMetadata(ROLES_KEY, controllerClass)).toEqual([
      'PLATFORM_OWNER',
      'ADMINISTRADOR',
    ]);
  });

  it('un ADMINISTRADOR pasa el guard de roles', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = module.get(RolesGuard);

    expect(guard.canActivate(rolesGuardContext('ADMINISTRADOR'))).toBe(true);
  });

  it('un OPERADOR recibe FORBIDDEN', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    const guard = module.get(RolesGuard);

    expect(() => guard.canActivate(rolesGuardContext('OPERADOR'))).toThrow(
      ForbiddenException,
    );
  });

  it('TenantScopeGuard deja pasar: la organización viene del JWT, sin :id', () => {
    expect(new TenantScopeGuard().canActivate(tenantContext('org-1', {}))).toBe(
      true,
    );
  });

  it('TenantScopeGuard rechaza una organización ajena en la ruta', () => {
    expect(() =>
      new TenantScopeGuard().canActivate(
        tenantContext('org-1', { id: 'org-2' }),
      ),
    ).toThrow(ForbiddenException);
  });
});
