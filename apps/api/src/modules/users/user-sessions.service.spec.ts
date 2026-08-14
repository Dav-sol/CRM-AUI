import {
  UserSessionsService,
  SessionValidationResult,
} from './user-sessions.service';
import { PrismaService } from '../../core/database/prisma.service';

interface UserSessionRepo {
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  findUnique: jest.Mock;
}

describe('UserSessionsService', () => {
  let service: UserSessionsService;
  let userSession: UserSessionRepo;

  const baseSession = {
    id: 'session-1',
    uuid: 'uuid-s1',
    userId: 'user-1',
    refreshTokenHash: 'hash-of-token-a',
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    userSession = {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    };
    const prisma = { userSession } as unknown as PrismaService;
    service = new UserSessionsService(prisma);
  });

  describe('validateForRenewal', () => {
    it('allows renewal for an ACTIVE user with matching hash', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        user: { status: 'ACTIVE', deletedAt: null },
      });
      const result = (await service.validateForRenewal(
        'session-1',
        'hash-of-token-a',
      )) as Extract<SessionValidationResult, { ok: true }>;
      expect(result.ok).toBe(true);
    });

    it('rejects an unknown session', async () => {
      userSession.findUnique.mockResolvedValue(null);
      const result = await service.validateForRenewal('session-x', 'hash');
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('rejects a revoked session', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        revokedAt: new Date(),
        user: { status: 'ACTIVE', deletedAt: null },
      });
      const result = await service.validateForRenewal(
        'session-1',
        'hash-of-token-a',
      );
      expect(result).toEqual({ ok: false, reason: 'revoked' });
    });

    it('rejects an expired session', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        expiresAt: new Date(Date.now() - 1000),
        user: { status: 'ACTIVE', deletedAt: null },
      });
      const result = await service.validateForRenewal(
        'session-1',
        'hash-of-token-a',
      );
      expect(result).toEqual({ ok: false, reason: 'expired' });
    });

    it('detects reuse when the presented hash does not match', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        user: { status: 'ACTIVE', deletedAt: null },
      });
      const result = await service.validateForRenewal(
        'session-1',
        'hash-of-token-b',
      );
      expect(result).toEqual({ ok: false, reason: 'reuse' });
    });

    it('blocks SUSPENDED users from renewal', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        user: { status: 'SUSPENDED', deletedAt: null },
      });
      const result = await service.validateForRenewal(
        'session-1',
        'hash-of-token-a',
      );
      expect(result).toEqual({ ok: false, reason: 'user_suspended' });
    });

    it('blocks deleted users from renewal', async () => {
      userSession.findUnique.mockResolvedValue({
        ...baseSession,
        user: { status: 'ACTIVE', deletedAt: new Date() },
      });
      const result = await service.validateForRenewal(
        'session-1',
        'hash-of-token-a',
      );
      expect(result).toEqual({ ok: false, reason: 'user_deleted' });
    });
  });

  describe('create / rotate / revoke', () => {
    it('creates a session with the hashed refresh token', async () => {
      userSession.create.mockResolvedValue(baseSession);
      await service.create({
        id: 'session-1',
        userId: 'user-1',
        refreshTokenHash: 'hashed',
        expiresAt: new Date(),
      });
      expect(userSession.create).toHaveBeenCalledWith({
        data: {
          id: 'session-1',
          userId: 'user-1',
          refreshTokenHash: 'hashed',
          expiresAt: expect.any(Date) as Date,
          userAgent: null,
          ip: null,
        },
      });
    });

    it('rotates by revoking the old session row and creating a new one', async () => {
      userSession.updateMany.mockResolvedValue({ count: 1 });
      const newSession = { ...baseSession, id: 'session-2' };
      userSession.create.mockResolvedValue(newSession);
      const expiresAt = new Date(Date.now() + 3600_000);
      const result = await service.rotate('user-1', 'session-1', {
        id: 'session-2',
        refreshTokenHash: 'new-hash',
        expiresAt,
      });
      expect(userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(userSession.create).toHaveBeenCalledWith({
        data: {
          id: 'session-2',
          userId: 'user-1',
          refreshTokenHash: 'new-hash',
          expiresAt,
          lastUsedAt: expect.any(Date) as Date,
        },
      });
      expect(result).toEqual(newSession);
    });

    it('revokes a session scoped to the user', async () => {
      userSession.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.revoke('user-1', 'session-1');
      expect(userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result).toEqual({ revoked: true });
    });
  });
});
