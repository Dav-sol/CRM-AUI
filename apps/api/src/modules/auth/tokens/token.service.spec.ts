import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;
  const configMock: Pick<ConfigService, 'get'> = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'jwt.secret':
          return 'access-secret-at-least-32-chars-long!!';
        case 'jwt.refreshSecret':
          return 'refresh-secret-at-least-32-chars-long!';
        case 'jwt.accessTokenTtl':
          return '15m';
        case 'jwt.refreshTokenTtl':
          return '7d';
        default:
          return undefined;
      }
    }),
  };

  beforeEach(() => {
    jwtService = new JwtService({});
    tokenService = new TokenService(jwtService, configMock as ConfigService);
  });

  const platformUser = {
    id: 'user-1',
    uuid: 'uuid-1',
    accountType: 'PLATFORM' as const,
    organizationId: null,
    role: 'PLATFORM_OWNER' as const,
  };

  const decode = (token: string) =>
    jwtService.decode<Record<string, unknown> | null | string>(token);

  it('signs an access token with the five required claims', () => {
    const token = tokenService.signAccessToken(platformUser);
    expect(decode(token)).toMatchObject({
      sub: 'uuid-1',
      userId: 'user-1',
      accountType: 'PLATFORM',
      organizationId: null,
      role: 'PLATFORM_OWNER',
    });
  });

  it('signs an organization access token with organizationId and role', () => {
    const token = tokenService.signAccessToken({
      id: 'user-2',
      uuid: 'uuid-2',
      accountType: 'ORGANIZATION',
      organizationId: 'org-1',
      role: 'ADMINISTRADOR',
    });
    expect(decode(token)).toMatchObject({
      accountType: 'ORGANIZATION',
      organizationId: 'org-1',
      role: 'ADMINISTRADOR',
    });
  });

  it('signs and verifies a refresh token carrying userId and session jti', () => {
    const token = tokenService.signRefreshToken('user-1', 'session-1');
    const payload = tokenService.verifyRefreshToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.userId).toBe('user-1');
    expect(payload.jti).toBe('session-1');
  });

  it('rejects a refresh token signed with a different secret', () => {
    const token = tokenService.signRefreshToken('user-1', 'session-1');
    expect(() => {
      jwtService.verify(token, { secret: 'a-different-secret' });
    }).toThrow();
  });

  it('reports the access token TTL in seconds', () => {
    expect(tokenService.accessTokenExpiresInSeconds()).toBe(900);
  });
});
