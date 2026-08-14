import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { RefreshTokenPayload } from '../tokens/token.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    const cookieName =
      configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token';
    super({
      jwtFromRequest: (req: Request) => {
        const cookies = req.cookies as Record<string, string> | undefined;
        return cookies?.[cookieName] ?? null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret') ?? '',
    });
  }

  validate(payload: RefreshTokenPayload) {
    return {
      userId: payload.userId,
      sessionId: payload.jti,
    };
  }
}
