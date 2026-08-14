import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserSessionsService } from '../users/user-sessions.service';
import { TokenService } from './tokens/token.service';
import { RefreshTokenHasher } from './tokens/refresh-token-hasher';
import { AuditIdentityService } from './audit.identity.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    verifyPassword: jest.Mock;
  };
  let sessionsService: {
    create: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
    validateForRenewal: jest.Mock;
  };
  let tokenService: {
    signAccessToken: jest.Mock;
    signRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
    accessTokenExpiresInSeconds: jest.Mock;
  };
  let hasher: { hash: jest.Mock };
  let config: { get: jest.Mock };
  let auditService: { record: jest.Mock };

  const platformOwner = {
    id: 'u-plat',
    uuid: 'uuid-plat',
    email: 'owner@platform.test',
    firstName: 'Platform',
    lastName: 'Owner',
    passwordHash: 'bcrypt-hash',
    status: 'ACTIVE',
    deletedAt: null,
    accountType: 'PLATFORM',
    organizationId: null,
    roleId: null,
    role: null,
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      verifyPassword: jest.fn(),
    };
    sessionsService = {
      create: jest.fn(),
      rotate: jest.fn(),
      revoke: jest.fn(),
      validateForRenewal: jest.fn(),
    };
    tokenService = {
      signAccessToken: jest.fn().mockReturnValue('access-token'),
      signRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      verifyRefreshToken: jest.fn(),
      accessTokenExpiresInSeconds: jest.fn().mockReturnValue(900),
    };
    hasher = { hash: jest.fn().mockReturnValue('sha256-hash') };
    config = {
      get: jest.fn((key: string) =>
        key === 'jwt.refreshTokenTtl' ? '7d' : '15m',
      ),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      usersService as unknown as UsersService,
      tokenService as unknown as TokenService,
      sessionsService as unknown as UserSessionsService,
      hasher as unknown as RefreshTokenHasher,
      config as unknown as ConfigService,
      auditService as unknown as AuditIdentityService,
    );

    sessionsService.create.mockResolvedValue({ id: 'session-1' });
  });

  describe('login (US1 - PLATFORM_OWNER)', () => {
    it('issues an access token with PLATFORM claims and a hashed session', async () => {
      usersService.findByEmail.mockResolvedValue(platformOwner);
      usersService.verifyPassword.mockResolvedValue(true);

      const result = await service.login('owner@platform.test', 'ValidPass123');

      expect(result.accessToken).toBe('access-token');
      expect(tokenService.signAccessToken).toHaveBeenCalledWith({
        id: 'u-plat',
        uuid: 'uuid-plat',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });
      expect(tokenService.signRefreshToken).toHaveBeenCalledWith(
        'u-plat',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
      expect(hasher.hash).toHaveBeenCalledWith('refresh-token');
      expect(sessionsService.create).toHaveBeenCalledWith({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        userId: 'u-plat',
        refreshTokenHash: 'sha256-hash',
        expiresAt: expect.any(Date) as Date,
        userAgent: null,
        ip: null,
      });
    });

    it('returns the same uniform INVALID_CREDENTIALS for unknown email and wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login('nobody@example.com', 'Whatever123'),
      ).rejects.toThrow(UnauthorizedException);

      usersService.findByEmail.mockResolvedValue(platformOwner);
      usersService.verifyPassword.mockResolvedValue(false);
      await expect(
        service.login('owner@platform.test', 'WrongPass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('blocks INVITED users with a uniform 401', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...platformOwner,
        status: 'INVITED',
      });
      usersService.verifyPassword.mockResolvedValue(true);
      await expect(
        service.login('invited@platform.test', 'ValidPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('blocks SUSPENDED users with a uniform 401', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...platformOwner,
        status: 'SUSPENDED',
      });
      usersService.verifyPassword.mockResolvedValue(true);
      await expect(
        service.login('suspended@platform.test', 'ValidPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('blocks deleted users with a uniform 401', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...platformOwner,
        deletedAt: new Date(),
      });
      usersService.verifyPassword.mockResolvedValue(true);
      await expect(
        service.login('deleted@platform.test', 'ValidPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('never reveals account existence in the error body', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login('nobody@example.com', 'x'),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          },
        },
      });
    });
  });

  describe('login (US2 - organization users)', () => {
    const orgUser = (roleName: string) => ({
      ...platformOwner,
      id: `u-${roleName.toLowerCase()}`,
      email: `${roleName.toLowerCase()}@org.test`,
      accountType: 'ORGANIZATION',
      organizationId: 'org-1',
      roleId: `role-${roleName.toLowerCase()}`,
      role: { name: roleName },
    });

    it.each(['ADMINISTRADOR', 'GERENTE', 'OPERADOR'])(
      'resolves the role claim from the Role relation for %s',
      async (roleName) => {
        usersService.findByEmail.mockResolvedValue(orgUser(roleName));
        usersService.verifyPassword.mockResolvedValue(true);

        await service.login(
          `${roleName.toLowerCase()}@org.test`,
          'ValidPass123',
        );

        expect(tokenService.signAccessToken).toHaveBeenCalledWith({
          id: `u-${roleName.toLowerCase()}`,
          uuid: 'uuid-plat',
          accountType: 'ORGANIZATION',
          organizationId: 'org-1',
          role: roleName,
        });
      },
    );

    it('returns the organizationId and role in the login result user', async () => {
      usersService.findByEmail.mockResolvedValue(orgUser('GERENTE'));
      usersService.verifyPassword.mockResolvedValue(true);

      const result = await service.login('gerente@org.test', 'ValidPass123');

      expect(result.user).toMatchObject({
        accountType: 'ORGANIZATION',
        organizationId: 'org-1',
        role: 'GERENTE',
      });
    });

    it('rejects an organization user without a role relation with a uniform 401', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...orgUser('ADMINISTRADOR'),
        role: null,
      });
      usersService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login('admin@org.test', 'ValidPass123'),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          },
        },
      });
    });
  });

  describe('refresh (US7)', () => {
    const activeSession = {
      id: 'session-1',
      userId: 'u-plat',
      refreshTokenHash: 'sha256-hash',
      expiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
      user: { ...platformOwner, role: null },
    };

    it('rotates the session and issues a new access token with fresh claims', async () => {
      sessionsService.validateForRenewal.mockResolvedValue({
        ok: true,
        session: activeSession,
      });
      sessionsService.rotate.mockResolvedValue({ id: 'session-2' });

      const result = await service.refresh(
        'u-plat',
        'session-1',
        'refresh-token',
      );

      expect(tokenService.signAccessToken).toHaveBeenCalledWith({
        id: 'u-plat',
        uuid: 'uuid-plat',
        accountType: 'PLATFORM',
        organizationId: null,
        role: 'PLATFORM_OWNER',
      });
      expect(tokenService.signRefreshToken).toHaveBeenCalledWith(
        'u-plat',
        expect.not.stringMatching(/^session-1$/) as string,
      );
      expect(sessionsService.rotate).toHaveBeenCalledWith(
        'u-plat',
        'session-1',
        {
          id: expect.any(String) as string,
          refreshTokenHash: 'sha256-hash',
          expiresAt: expect.any(Date) as Date,
        },
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        sessionId: 'session-2',
      });
    });

    it('returns 400 INVALID_OR_EXPIRED_TOKEN for revoked/expired/not-found sessions', async () => {
      sessionsService.validateForRenewal.mockResolvedValue({
        ok: false,
        reason: 'revoked',
      });

      await expect(
        service.refresh('u-plat', 'session-1', 'refresh-token'),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'INVALID_OR_EXPIRED_TOKEN',
            message: 'Invalid or expired token',
          },
        },
      });
    });

    it('returns 401 INVALID_CREDENTIALS for a SUSPENDED user', async () => {
      sessionsService.validateForRenewal.mockResolvedValue({
        ok: false,
        reason: 'user_suspended',
      });

      await expect(
        service.refresh('u-plat', 'session-1', 'refresh-token'),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'INVALID_CREDENTIALS' },
        },
      });
    });

    it('revokes the session and returns 400 when a token is reused', async () => {
      sessionsService.validateForRenewal.mockResolvedValue({
        ok: false,
        reason: 'reuse',
      });
      sessionsService.revoke.mockResolvedValue({ revoked: true });

      await expect(
        service.refresh('u-plat', 'session-1', 'old-refresh-token'),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
        },
      });
      expect(sessionsService.revoke).toHaveBeenCalledWith(
        'u-plat',
        'session-1',
      );
    });
  });

  describe('logout (US7)', () => {
    it('revokes the session for a valid refresh token', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({
        sub: 'u-plat',
        userId: 'u-plat',
        jti: 'session-1',
      });
      sessionsService.revoke.mockResolvedValue({ revoked: true });

      await expect(service.logout('refresh-token')).resolves.toBeUndefined();
      expect(sessionsService.revoke).toHaveBeenCalledWith(
        'u-plat',
        'session-1',
      );
    });

    it('returns 401 UNAUTHORIZED for an invalid refresh token', async () => {
      tokenService.verifyRefreshToken.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.logout('bad-token')).rejects.toMatchObject({
        response: {
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        },
      });
    });

    it('returns 401 UNAUTHORIZED when no live session exists', async () => {
      tokenService.verifyRefreshToken.mockReturnValue({
        sub: 'u-plat',
        userId: 'u-plat',
        jti: 'session-1',
      });
      sessionsService.revoke.mockResolvedValue({ revoked: false });

      await expect(service.logout('refresh-token')).rejects.toMatchObject({
        response: {
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        },
      });
    });
  });
});
