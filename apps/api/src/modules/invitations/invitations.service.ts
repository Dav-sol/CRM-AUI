import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthService, LoginContext, LoginResult } from '../auth/auth.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { RefreshTokenHasher } from '../auth/tokens/refresh-token-hasher';
import { UsersService } from '../users/users.service';

export interface InvitationResult {
  id: string;
  email: string;
  expiresAt: Date;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: RefreshTokenHasher,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditIdentityService,
  ) {}

  async create(
    inviter: AuthUser,
    email: string,
    roleId: string,
    organizationId: string,
  ): Promise<InvitationResult> {
    if (inviter.accountType === 'ORGANIZATION') {
      if (inviter.role !== 'ADMINISTRADOR') {
        await this.auditService.record({
          action: 'invitation.create',
          outcome: 'failure',
          userId: inviter.id,
          organizationId: inviter.organizationId,
          metadata: { reason: 'role_not_allowed' },
        });
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: 'Forbidden' },
        });
      }
      if (inviter.organizationId !== organizationId) {
        await this.auditService.record({
          action: 'invitation.create',
          outcome: 'failure',
          userId: inviter.id,
          organizationId: inviter.organizationId,
          metadata: { reason: 'cross_organization' },
        });
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: 'Forbidden' },
        });
      }
    }

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
    });
    if (!role) {
      await this.auditService.record({
        action: 'invitation.create',
        outcome: 'failure',
        userId: inviter.id,
        organizationId: inviter.organizationId,
        metadata: { reason: 'invalid_role' },
      });
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid role for organization',
        },
      });
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { email, status: 'PENDING' },
    });
    if (pending) {
      await this.auditService.record({
        action: 'invitation.create',
        outcome: 'failure',
        userId: inviter.id,
        organizationId: inviter.organizationId,
        metadata: { reason: 'duplicate_pending' },
      });
      throw new ConflictException({
        error: {
          code: 'CONFLICT',
          message: 'A pending invitation already exists for this email',
        },
      });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const ttl = this.configService.get<string>('jwt.invitationTokenTtl');
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        invitedById: inviter.id,
        email,
        roleId,
        tokenHash: this.hasher.hash(rawToken),
        expiresAt: new Date(Date.now() + this.ttlToMs(ttl)),
      },
    });

    // Delivery channel (email) is outside Identity v1 scope; log for dev use.
    this.logger.warn(
      `invitation issued id=${invitation.id} email=${email} token=${rawToken} (dev placeholder until email channel exists)`,
    );

    await this.auditService.record({
      action: 'invitation.create',
      outcome: 'success',
      userId: inviter.id,
      organizationId: invitation.organizationId,
      description: `invitation issued id=${invitation.id} email=${invitation.email}`,
    });

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(
    token: string,
    password: string,
    context: LoginContext,
  ): Promise<LoginResult> {
    const hash = this.hasher.hash(token);
    const invitation = await this.prisma.invitation.findFirst({
      where: { tokenHash: hash },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      this.logger.warn(
        `invitation accept rejected tokenState=${invitation ? invitation.status : 'not_found'}`,
      );
      await this.auditService.record({
        action: 'invitation.accept',
        outcome: 'failure',
        organizationId: invitation?.organizationId ?? null,
        metadata: { reason: invitation ? 'not_pending' : 'not_found' },
      });
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      this.logger.warn(
        `invitation accept rejected tokenState=expired id=${invitation.id}`,
      );
      await this.auditService.record({
        action: 'invitation.accept',
        outcome: 'failure',
        organizationId: invitation.organizationId,
        metadata: { reason: 'expired' },
      });
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }

    const passwordHash = await this.usersService.hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          firstName: '',
          lastName: '',
          accountType: 'ORGANIZATION',
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
          status: 'INVITED',
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      return tx.user.update({
        where: { id: created.id },
        data: { status: 'ACTIVE' },
      });
    });

    this.logger.log(
      `invitation accepted id=${invitation.id} userId=${user.id} organizationId=${invitation.organizationId}`,
    );
    await this.auditService.record({
      action: 'invitation.accept',
      outcome: 'success',
      userId: user.id,
      organizationId: invitation.organizationId,
      description: `invitation accepted id=${invitation.id}`,
    });

    return this.authService.login(user.email, password, context);
  }

  private ttlToMs(ttl?: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(ttl ?? '');
    if (!match) {
      return 48 * 3600_000;
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
