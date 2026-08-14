import { ConfigService } from '@nestjs/config';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetTokenService } from './password-reset-token.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenHasher } from '../auth/tokens/refresh-token-hasher';
import { AuditIdentityService } from '../auth/audit.identity.service';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let usersService: {
    findByEmail: jest.Mock;
    hashPassword: jest.Mock;
    updatePassword: jest.Mock;
  };
  let tokenService: {
    create: jest.Mock;
    consume: jest.Mock;
  };
  let hasher: { hash: jest.Mock };
  let config: { get: jest.Mock };
  let auditService: { record: jest.Mock };

  const baseUser = {
    id: 'u-1',
    uuid: 'uuid-1',
    email: 'user@test.test',
    firstName: 'User',
    lastName: 'One',
    passwordHash: 'bcrypt-hash',
    status: 'ACTIVE',
    deletedAt: null,
    accountType: 'ORGANIZATION',
    organizationId: 'org-1',
    roleId: 'role-1',
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      hashPassword: jest.fn().mockResolvedValue('new-bcrypt-hash'),
      updatePassword: jest.fn().mockResolvedValue({}),
    };
    tokenService = {
      create: jest.fn().mockResolvedValue({}),
      consume: jest.fn(),
    };
    hasher = { hash: jest.fn().mockReturnValue('sha256-token-hash') };
    config = {
      get: jest.fn((key: string) =>
        key === 'jwt.passwordResetTokenTtl' ? '1h' : undefined,
      ),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PasswordResetService(
      usersService as unknown as UsersService,
      tokenService as unknown as PasswordResetTokenService,
      hasher as unknown as RefreshTokenHasher,
      config as unknown as ConfigService,
      auditService as unknown as AuditIdentityService,
    );
  });

  describe('requestReset (state matrix)', () => {
    const genericMessage =
      'If an account exists with that email, a password reset link has been sent';

    it('issues a hashed token with the configured TTL for an ACTIVE user', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      const result = await service.requestReset('user@test.test');

      expect(result).toEqual({ message: genericMessage });
      expect(tokenService.create).toHaveBeenCalledWith({
        userId: 'u-1',
        tokenHash: 'sha256-token-hash',
        expiresAt: expect.any(Date) as Date,
      });
      const createCall = tokenService.create.mock.calls[0] as [
        { expiresAt: Date },
      ];
      const expiresAt = createCall[0].expiresAt;
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60_000);
    });

    it('returns the generic message for an INVITED user without issuing a token', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        status: 'INVITED',
      });

      const result = await service.requestReset('user@test.test');

      expect(result).toEqual({ message: genericMessage });
      expect(tokenService.create).not.toHaveBeenCalled();
    });

    it('returns the generic message for an unknown email without issuing a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.requestReset('unknown@test.test');

      expect(result).toEqual({ message: genericMessage });
      expect(tokenService.create).not.toHaveBeenCalled();
    });

    it('blocks a SUSPENDED user with 403 ACCOUNT_SUSPENDED', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        status: 'SUSPENDED',
      });

      await expect(
        service.requestReset('user@test.test'),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'ACCOUNT_SUSPENDED' },
        },
      });
    });

    it('blocks a deleted user with 403 ACCOUNT_DELETED', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });

      await expect(
        service.requestReset('user@test.test'),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'ACCOUNT_DELETED' },
        },
      });
    });
  });

  describe('confirmReset', () => {
    it('consumes the token and updates the password', async () => {
      tokenService.consume.mockResolvedValue({ ok: true, user: baseUser });

      await service.confirmReset('raw-token', 'NewValidPass123');

      expect(hasher.hash).toHaveBeenCalledWith('raw-token');
      expect(usersService.hashPassword).toHaveBeenCalledWith('NewValidPass123');
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        'u-1',
        'new-bcrypt-hash',
      );
    });

    it.each(['not_found', 'used', 'expired'] as const)(
      'returns 400 INVALID_OR_EXPIRED_TOKEN when the token is %s',
      async (reason) => {
        tokenService.consume.mockResolvedValue({ ok: false, reason });

        await expect(
          service.confirmReset('bad-token', 'NewValidPass123'),
        ).rejects.toMatchObject({
          response: {
            error: {
              code: 'INVALID_OR_EXPIRED_TOKEN',
              message: 'Invalid or expired token',
            },
          },
        });
        expect(usersService.updatePassword).not.toHaveBeenCalled();
      },
    );
  });
});
