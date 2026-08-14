import { Injectable } from '@nestjs/common';
import { Role, User, UserSession } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';

export type SessionWithUser = UserSession & {
  user: User & { role: Role | null };
};

export type SessionValidationResult =
  | { ok: true; session: SessionWithUser }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'revoked'
        | 'expired'
        | 'reuse'
        | 'user_suspended'
        | 'user_deleted';
    };

export interface CreateSessionInput {
  id?: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

@Injectable()
export class UserSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<UserSession> {
    return this.prisma.userSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
      },
    });
  }

  async rotate(
    userId: string,
    sessionId: string,
    nextSession: {
      id: string;
      refreshTokenHash: string;
      expiresAt: Date;
    },
  ): Promise<UserSession> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.prisma.userSession.create({
      data: {
        id: nextSession.id,
        userId,
        refreshTokenHash: nextSession.refreshTokenHash,
        expiresAt: nextSession.expiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  async revoke(
    userId: string,
    sessionId: string,
  ): Promise<{ revoked: boolean }> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
  }

  async validateForRenewal(
    sessionId: string,
    presentedHash: string,
  ): Promise<SessionValidationResult> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { user: { include: { role: true } } },
    });

    if (!session) {
      return { ok: false, reason: 'not_found' };
    }
    if (session.revokedAt) {
      return { ok: false, reason: 'revoked' };
    }
    if (session.expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    if (!this.hashesMatch(session.refreshTokenHash, presentedHash)) {
      return { ok: false, reason: 'reuse' };
    }
    if (session.user.status === 'SUSPENDED') {
      return { ok: false, reason: 'user_suspended' };
    }
    if (session.user.deletedAt) {
      return { ok: false, reason: 'user_deleted' };
    }

    return { ok: true, session };
  }

  private hashesMatch(stored: string, presented: string): boolean {
    const a = Buffer.from(stored, 'utf8');
    const b = Buffer.from(presented, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
