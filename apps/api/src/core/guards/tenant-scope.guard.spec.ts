import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { TenantScopeGuard } from './tenant-scope.guard';
import { AuthUser } from '../decorators/current-user.decorator';

describe('TenantScopeGuard', () => {
  let guard: TenantScopeGuard;

  const orgUser = (organizationId: string | null): AuthUser => ({
    id: 'u-1',
    uuid: 'uuid-1',
    accountType: 'ORGANIZATION',
    organizationId,
    role: 'ADMINISTRADOR',
  });

  const platformOwner: AuthUser = {
    id: 'u-owner',
    uuid: 'uuid-owner',
    accountType: 'PLATFORM',
    organizationId: null,
    role: 'PLATFORM_OWNER',
  };

  const buildContext = (
    user: AuthUser | undefined,
    params: object,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () =>
          ({
            user,
            params,
          }) as Request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new TenantScopeGuard();
  });

  it('allows an organization user to access its own organization resource', () => {
    const ctx = buildContext(orgUser('org-1'), { id: 'org-1' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('forbids an organization user from accessing another organization resource', () => {
    const ctx = buildContext(orgUser('org-1'), { id: 'org-2' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows a PLATFORM_OWNER to access any organization resource (bypass)', () => {
    const ctx = buildContext(platformOwner, { id: 'org-999' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows requests without an organizationId in the path', () => {
    const ctx = buildContext(orgUser('org-1'), {});
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
