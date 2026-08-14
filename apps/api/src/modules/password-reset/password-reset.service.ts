import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PasswordResetTokenService } from './password-reset-token.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenHasher } from '../auth/tokens/refresh-token-hasher';
import { AuditIdentityService } from '../auth/audit.identity.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: PasswordResetTokenService,
    private readonly hasher: RefreshTokenHasher,
    private readonly configService: ConfigService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async requestReset(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (user?.status === 'SUSPENDED') {
      await this.auditService.record({
        action: 'password_reset.request',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId,
        metadata: { reason: 'suspended' },
      });
      throw new ForbiddenException({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message:
            'Account is suspended; contact administrator to restore access.',
        },
      });
    }
    if (user?.deletedAt) {
      await this.auditService.record({
        action: 'password_reset.request',
        outcome: 'failure',
        userId: user.id,
        organizationId: user.organizationId,
        metadata: { reason: 'deleted' },
      });
      throw new ForbiddenException({
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'Account is deleted; cannot perform password reset.',
        },
      });
    }

    if (user?.status === 'ACTIVE') {
      const rawToken = randomBytes(32).toString('base64url');
      const ttl = this.configService.get<string>('jwt.passwordResetTokenTtl');
      await this.tokenService.create({
        userId: user.id,
        tokenHash: this.hasher.hash(rawToken),
        expiresAt: new Date(Date.now() + this.ttlToMs(ttl)),
      });
      // Delivery channel (email) is outside Identity v1 scope; log for dev use.
      this.logger.warn(
        `password reset token issued userId=${user.id} token=${rawToken} (dev placeholder until email channel exists)`,
      );
      await this.auditService.record({
        action: 'password_reset.request',
        outcome: 'success',
        userId: user.id,
        organizationId: user.organizationId,
      });
    } else {
      await this.auditService.record({
        action: 'password_reset.request',
        outcome: 'failure',
        userId: user?.id ?? null,
        organizationId: user?.organizationId ?? null,
        metadata: { reason: user ? 'not_active' : 'unknown_email' },
      });
    }

    return {
      message:
        'If an account exists with that email, a password reset link has been sent',
    };
  }

  async confirmReset(token: string, password: string): Promise<void> {
    const hash = this.hasher.hash(token);
    const state = await this.tokenService.consume(hash);

    if (!state.ok || !state.user) {
      this.logger.warn(
        `password reset rejected reason=${state.ok ? 'unknown' : state.reason}`,
      );
      await this.auditService.record({
        action: 'password_reset.confirm',
        outcome: 'failure',
        metadata: { reason: state.ok ? 'unknown' : state.reason },
      });
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }

    const passwordHash = await this.usersService.hashPassword(password);
    await this.usersService.updatePassword(state.user.id, passwordHash);
    this.logger.log(`password reset success userId=${state.user.id}`);
    await this.auditService.record({
      action: 'password_reset.confirm',
      outcome: 'success',
      userId: state.user.id,
      organizationId: state.user.organizationId,
    });
  }

  private ttlToMs(ttl?: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(ttl ?? '');
    if (!match) {
      return 3600_000;
    }
    const value = parseInt(match[1], 10);
    const multiplier: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3600_000,
      d: 24 * 3600_000,
    };
    return value * multiplier[match[2]];
  }
}
