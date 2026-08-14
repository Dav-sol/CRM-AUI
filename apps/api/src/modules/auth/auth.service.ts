import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { UserSessionsService } from '../users/user-sessions.service';
import {
  TokenService,
  AuthRole,
  RefreshTokenPayload,
} from './tokens/token.service';
import { RefreshTokenHasher } from './tokens/refresh-token-hasher';
import { AuditIdentityService } from './audit.identity.service';

export interface LoginContext {
  userAgent?: string | null;
  ip?: string | null;
}

export interface AuthUserResult {
  id: string;
  uuid: string;
  email: string;
  firstName: string;
  lastName: string;
  accountType: 'PLATFORM' | 'ORGANIZATION';
  organizationId: string | null;
  role: AuthRole;
  status: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUserResult;
}

type UserWithRole = User & { role: { name: AuthRole } | null };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly sessionsService: UserSessionsService,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly configService: ConfigService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async login(
    email: string,
    password: string,
    context: LoginContext = {},
  ): Promise<LoginResult> {
    const user = await this.usersService.findByEmail(email);

    const passwordValid =
      user !== null &&
      (await this.usersService.verifyPassword(password, user.passwordHash));
    const eligible =
      user !== null && user.status === 'ACTIVE' && user.deletedAt === null;

    if (!passwordValid || !eligible) {
      this.logger.warn(
        `login rejected email=${email} reason=${user ? (user.status === 'ACTIVE' && !user.deletedAt ? 'invalid_password' : user.status.toLowerCase()) : 'unknown_email'}`,
      );
      await this.auditService.record({
        action: 'auth.login',
        outcome: 'failure',
        userId: user?.id ?? null,
        organizationId: user?.organizationId ?? null,
        metadata: {
          reason: user
            ? user.status === 'ACTIVE' && !user.deletedAt
              ? 'invalid_password'
              : user.status.toLowerCase()
            : 'unknown_email',
        },
      });
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }

    const claims = this.resolveClaims(user);

    const sessionId = randomUUID();
    const refreshToken = this.tokenService.signRefreshToken(user.id, sessionId);
    const refreshTokenHash = this.refreshTokenHasher.hash(refreshToken);
    const refreshTtl =
      this.configService.get<string>('jwt.refreshTokenTtl') ?? '7d';

    const session = await this.sessionsService.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + this.ttlToMs(refreshTtl)),
      userAgent: context.userAgent ?? null,
      ip: context.ip ?? null,
    });

    const accessToken = this.tokenService.signAccessToken({
      id: user.id,
      uuid: user.uuid,
      accountType: user.accountType,
      organizationId: user.organizationId,
      role: claims.role,
    });

    this.logger.log(
      `login success userId=${user.id} accountType=${user.accountType} sessionId=${session.id}`,
    );
    await this.auditService.record({
      action: 'auth.login',
      outcome: 'success',
      userId: user.id,
      organizationId: user.organizationId,
      description: `session created sessionId=${session.id}`,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.accessTokenExpiresInSeconds(),
      user: {
        id: user.id,
        uuid: user.uuid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accountType: user.accountType,
        organizationId: user.organizationId,
        role: claims.role,
        status: user.status,
      },
    };
  }

  async refresh(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<Omit<LoginResult, 'user'> & { sessionId: string }> {
    const presentedHash = this.refreshTokenHasher.hash(refreshToken);
    const result = await this.sessionsService.validateForRenewal(
      sessionId,
      presentedHash,
    );

    if (!result.ok) {
      this.logger.warn(
        `refresh rejected sessionId=${sessionId} reason=${result.reason}`,
      );
      if (result.reason === 'reuse') {
        await this.sessionsService
          .revoke(userId, sessionId)
          .catch(() => undefined);
      }
      await this.auditService.record({
        action: 'auth.refresh',
        outcome: 'failure',
        userId,
        organizationId: null,
        metadata: { reason: result.reason },
      });
      if (
        result.reason === 'user_suspended' ||
        result.reason === 'user_deleted'
      ) {
        throw new UnauthorizedException({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          },
        });
      }
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }

    const claims = this.resolveClaims(result.session.user);

    const nextSessionId = randomUUID();
    const newRefreshToken = this.tokenService.signRefreshToken(
      userId,
      nextSessionId,
    );
    const refreshTtl =
      this.configService.get<string>('jwt.refreshTokenTtl') ?? '7d';
    const newSession = await this.sessionsService.rotate(
      userId,
      result.session.id,
      {
        id: nextSessionId,
        refreshTokenHash: this.refreshTokenHasher.hash(newRefreshToken),
        expiresAt: new Date(Date.now() + this.ttlToMs(refreshTtl)),
      },
    );

    const accessToken = this.tokenService.signAccessToken({
      id: result.session.user.id,
      uuid: result.session.user.uuid,
      accountType: result.session.user.accountType,
      organizationId: result.session.user.organizationId,
      role: claims.role,
    });

    await this.auditService.record({
      action: 'auth.refresh',
      outcome: 'success',
      userId,
      organizationId: result.session.user.organizationId,
      description: `session rotated ${sessionId} -> ${newSession.id}`,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.tokenService.accessTokenExpiresInSeconds(),
      sessionId: newSession.id,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      await this.auditService.record({
        action: 'auth.logout',
        outcome: 'failure',
        metadata: { reason: 'invalid_token' },
      });
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }

    const { revoked } = await this.sessionsService.revoke(
      payload.userId,
      payload.jti,
    );
    if (!revoked) {
      await this.auditService.record({
        action: 'auth.logout',
        outcome: 'failure',
        userId: payload.userId,
        metadata: { reason: 'no_live_session' },
      });
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }

    this.logger.log(
      `logout success userId=${payload.userId} sessionId=${payload.jti}`,
    );
    await this.auditService.record({
      action: 'auth.logout',
      outcome: 'success',
      userId: payload.userId,
      description: `session revoked sessionId=${payload.jti}`,
    });
  }

  async me(userId: string): Promise<AuthUserResult> {
    const user = await this.usersService.findById(userId);
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }
    const claims = this.resolveClaims(user);
    return {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      accountType: user.accountType,
      organizationId: user.organizationId,
      role: claims.role,
      status: user.status,
    };
  }

  private resolveClaims(user: UserWithRole): {
    role: AuthRole;
  } {
    if (user.accountType === 'PLATFORM') {
      return { role: 'PLATFORM_OWNER' };
    }
    if (!user.role) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }
    return { role: user.role.name };
  }

  private ttlToMs(ttl: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(ttl);
    if (!match) {
      return 7 * 24 * 3600 * 1000;
    }
    const value = parseInt(match[1], 10);
    const multiplier: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 3600 * 1000,
      d: 24 * 3600 * 1000,
    };
    return value * multiplier[match[2]];
  }
}
