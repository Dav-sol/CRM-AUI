import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationsService } from './invitations.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenHasher } from '../auth/tokens/refresh-token-hasher';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    role: { findFirst: jest.Mock };
    invitation: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    user: { create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { login: jest.Mock };
  let usersService: { hashPassword: jest.Mock };
  let hasher: { hash: jest.Mock };
  let config: { get: jest.Mock };
  let auditService: { record: jest.Mock };

  const platformOwner: AuthUser = {
    id: 'u-owner',
    uuid: 'uuid-owner',
    accountType: 'PLATFORM',
    organizationId: null,
    role: 'PLATFORM_OWNER',
  };

  const administrador: AuthUser = {
    id: 'u-admin',
    uuid: 'uuid-admin',
    accountType: 'ORGANIZATION',
    organizationId: 'org-1',
    role: 'ADMINISTRADOR',
  };

  const gerente: AuthUser = {
    id: 'u-gerente',
    uuid: 'uuid-gerente',
    accountType: 'ORGANIZATION',
    organizationId: 'org-1',
    role: 'GERENTE',
  };

  const baseInvitation = {
    id: 'inv-1',
    uuid: 'uuid-inv-1',
    organizationId: 'org-1',
    invitedById: 'u-owner',
    email: 'invitee@org.test',
    roleId: 'role-1',
    tokenHash: 'sha256-token-hash',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600_000),
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      role: { findFirst: jest.fn() },
      invitation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    authService = { login: jest.fn() };
    usersService = { hashPassword: jest.fn().mockResolvedValue('bcrypt-hash') };
    hasher = { hash: jest.fn().mockReturnValue('sha256-token-hash') };
    config = {
      get: jest.fn((key: string) =>
        key === 'jwt.invitationTokenTtl' ? '48h' : undefined,
      ),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      hasher as unknown as RefreshTokenHasher,
      usersService as unknown as UsersService,
      authService as unknown as AuthService,
      config as unknown as ConfigService,
      auditService as unknown as AuditIdentityService,
    );
  });

  describe('create (US4 - PLATFORM_OWNER)', () => {
    it('creates an invitation to any organization with a hashed single-use token', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'OPERADOR',
      });
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue({
        ...baseInvitation,
        organizationId: 'org-9',
      });

      const result = await service.create(
        platformOwner,
        'invitee@org.test',
        'role-1',
        'org-9',
      );

      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-9',
          invitedById: 'u-owner',
          email: 'invitee@org.test',
          roleId: 'role-1',
          tokenHash: 'sha256-token-hash',
          expiresAt: expect.any(Date) as Date,
        },
      });
      const createCall = prisma.invitation.create.mock.calls[0] as [
        { data: { expiresAt: Date } },
      ];
      const expiresAt = createCall[0].data.expiresAt;
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        48 * 3600_000,
      );
      expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);
      expect(result).toEqual({
        id: 'inv-1',
        email: 'invitee@org.test',
        expiresAt: baseInvitation.expiresAt,
      });
    });

    it('returns 409 CONFLICT when a pending invitation exists for the email', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'OPERADOR',
      });
      prisma.invitation.findFirst.mockResolvedValue(baseInvitation);

      await expect(
        service.create(platformOwner, 'invitee@org.test', 'role-1', 'org-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('returns 400 VALIDATION_ERROR when the role does not belong to the target organization', async () => {
      prisma.role.findFirst.mockResolvedValue(null);

      await expect(
        service.create(platformOwner, 'invitee@org.test', 'role-x', 'org-9'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks GERENTE and OPERADOR with 403 FORBIDDEN', async () => {
      await expect(
        service.create(gerente, 'invitee@org.test', 'role-1', 'org-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks ADMINISTRADOR inviting into a foreign organization with 403 FORBIDDEN', async () => {
      await expect(
        service.create(administrador, 'invitee@org.test', 'role-1', 'org-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows ADMINISTRADOR inviting within the own organization (US5)', async () => {
      prisma.role.findFirst.mockResolvedValue({
        id: 'role-1',
        name: 'OPERADOR',
      });
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue(baseInvitation);

      const result = await service.create(
        administrador,
        'invitee@org.test',
        'role-1',
        'org-1',
      );

      expect(result).toEqual({
        id: 'inv-1',
        email: 'invitee@org.test',
        expiresAt: baseInvitation.expiresAt,
      });
    });
  });

  describe('accept (US4)', () => {
    it('creates the user INVITED→ACTIVE with org and role, marks the invitation accepted and starts a session', async () => {
      prisma.invitation.findFirst.mockResolvedValue(baseInvitation);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      );
      prisma.user.create.mockResolvedValue({
        id: 'u-new',
        email: 'invitee@org.test',
        passwordHash: '',
        firstName: '',
        lastName: '',
        accountType: 'ORGANIZATION',
        status: 'INVITED',
      });
      prisma.user.update.mockResolvedValue({
        id: 'u-new',
        email: 'invitee@org.test',
      });
      authService.login.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        user: { id: 'u-new' },
      });

      const result = await service.accept('raw-token', 'NewPass123', {});

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'invitee@org.test',
          firstName: '',
          lastName: '',
          accountType: 'ORGANIZATION',
          organizationId: 'org-1',
          roleId: 'role-1',
          status: 'INVITED',
          passwordHash: expect.any(String) as string,
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-new' },
        data: { status: 'ACTIVE' },
      });
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) as Date },
      });
      expect(authService.login).toHaveBeenCalledWith(
        'invitee@org.test',
        'NewPass123',
        {},
      );
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('returns 400 INVALID_OR_EXPIRED_TOKEN for an unknown token', async () => {
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(
        service.accept('bad-token', 'NewPass123', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 INVALID_OR_EXPIRED_TOKEN for an already accepted (reused) token', async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        ...baseInvitation,
        status: 'ACCEPTED',
      });

      await expect(
        service.accept('old-token', 'NewPass123', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 INVALID_OR_EXPIRED_TOKEN for an expired token', async () => {
      prisma.invitation.findFirst.mockResolvedValue({
        ...baseInvitation,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.accept('expired-token', 'NewPass123', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
