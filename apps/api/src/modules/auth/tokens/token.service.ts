import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AccountType, RoleType } from '@prisma/client';

export type AuthRole = RoleType | 'PLATFORM_OWNER';

export interface AccessTokenPayload {
  sub: string;
  userId: string;
  accountType: AccountType;
  organizationId: string | null;
  role: AuthRole;
}

export interface RefreshTokenPayload {
  sub: string;
  userId: string;
  jti: string;
}

export interface AccessTokenUser {
  id: string;
  uuid: string;
  accountType: AccountType;
  organizationId: string | null;
  role: AuthRole;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private signOptions(secretKey: string, ttlKey: string): JwtSignOptions {
    return {
      secret: this.configService.get<string>(secretKey) ?? '',
      expiresIn: (this.configService.get<string>(ttlKey) ??
        '15m') as JwtSignOptions['expiresIn'],
    };
  }

  signAccessToken(user: AccessTokenUser): string {
    const payload: AccessTokenPayload = {
      sub: user.uuid,
      userId: user.id,
      accountType: user.accountType,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.jwtService.sign(
      payload,
      this.signOptions('jwt.secret', 'jwt.accessTokenTtl'),
    );
  }

  signRefreshToken(userId: string, sessionId: string): string {
    const payload: RefreshTokenPayload = {
      sub: userId,
      userId,
      jti: sessionId,
    };
    return this.jwtService.sign(
      payload,
      this.signOptions('jwt.refreshSecret', 'jwt.refreshTokenTtl'),
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token, {
      secret: this.configService.get<string>('jwt.secret'),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
    });
  }

  accessTokenExpiresInSeconds(): number {
    const ttl = this.configService.get<string>('jwt.accessTokenTtl') ?? '15m';
    return this.ttlToSeconds(ttl);
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(ttl);
    if (!match) {
      return 900;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}
