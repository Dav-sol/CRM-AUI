import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Auth (e2e) — US1 PLATFORM_OWNER login', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let config: ConfigService;
  let platformUserId: string;
  let platformUserUuid: string;

  const email = 'owner@platform.test';
  const password = 'ValidPass123';
  const orgPassword = 'ValidPass123';
  let orgId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    config = app.get(ConfigService);

    const org = await prisma.organization.create({
      data: { name: 'Org One', slug: 'org1' },
      select: { id: true },
    });
    orgId = org.id;

    const roles = await Promise.all(
      (['ADMINISTRADOR', 'GERENTE', 'OPERADOR'] as const).map((name) =>
        prisma.role.create({
          data: { organizationId: orgId, name },
          select: { id: true, name: true },
        }),
      ),
    );
    const orgPasswordHash = await bcrypt.hash(orgPassword, 12);
    await prisma.user.createMany({
      data: roles.map((role) => ({
        email: `${role.name.toLowerCase()}@org1.test`,
        passwordHash: orgPasswordHash,
        firstName: 'Org',
        lastName: role.name,
        accountType: 'ORGANIZATION',
        organizationId: orgId,
        roleId: role.id,
        status: 'ACTIVE',
      })),
    });

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Platform',
        lastName: 'Owner',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
      select: { id: true, uuid: true },
    });
    platformUserId = created.id;
    platformUserUuid = created.uuid;
  });

  afterAll(async () => {
    const emails = [
      email,
      'invited@platform.test',
      'administrador@org1.test',
      'gerente@org1.test',
      'operador@org1.test',
    ];
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    await prisma.userSession.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it('logs in a PLATFORM_OWNER and issues the five JWT claims', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.accessToken).toBeDefined();
    expect(data.expiresIn).toBe(900);
    expect(data.user).toMatchObject({
      email,
      accountType: 'PLATFORM',
      organizationId: null,
      role: 'PLATFORM_OWNER',
    });
    expect(data).not.toHaveProperty('refreshToken');

    const payload = jwtService.decode<Record<string, unknown>>(
      data.accessToken as string,
    );
    expect(payload).toMatchObject({
      sub: platformUserUuid,
      userId: platformUserId,
      accountType: 'PLATFORM',
      organizationId: null,
      role: 'PLATFORM_OWNER',
    });
  });

  it('sets an HttpOnly refresh cookie on login', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const cookieName = config.get<string>('jwt.refreshCookieName');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith(`${cookieName}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
  });

  it('returns uniform 401 INVALID_CREDENTIALS for unknown email and wrong password', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever123' })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword123' })
      .expect(401);

    expect(unknown.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    });
    expect(wrong.body).toEqual(unknown.body);
  });

  it('blocks an INVITED user with uniform 401 (no account-existence leak)', async () => {
    await prisma.user.create({
      data: {
        email: 'invited@platform.test',
        passwordHash: await bcrypt.hash('Whatever123', 12),
        firstName: 'Invited',
        lastName: 'User',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'INVITED',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'invited@platform.test', password: 'Whatever123' })
      .expect(401);

    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    });

    await prisma.user.deleteMany({
      where: { email: 'invited@platform.test' },
    });
  });
});

describe('Auth (e2e) — US2 organization user login', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const password = 'ValidPass123';
  let orgId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const org = await prisma.organization.create({
      data: { name: 'Org Two', slug: 'org2' },
      select: { id: true },
    });
    orgId = org.id;

    const roles = await Promise.all(
      (['ADMINISTRADOR', 'GERENTE', 'OPERADOR'] as const).map((name) =>
        prisma.role.create({
          data: { organizationId: orgId, name },
          select: { id: true, name: true },
        }),
      ),
    );
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.createMany({
      data: roles.map((role) => ({
        email: `${role.name.toLowerCase()}@org2.test`,
        passwordHash: hash,
        firstName: 'Org',
        lastName: role.name,
        accountType: 'ORGANIZATION',
        organizationId: orgId,
        roleId: role.id,
        status: 'ACTIVE',
      })),
    });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: '@org2.test' } },
      select: { id: true },
    });
    await prisma.userSession.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it.each(['ADMINISTRADOR', 'GERENTE', 'OPERADOR'])(
    'logs in a %s user and issues org-bound JWT claims',
    async (roleName) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `${roleName.toLowerCase()}@org2.test`, password })
        .expect(200);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.user).toMatchObject({
        accountType: 'ORGANIZATION',
        organizationId: orgId,
        role: roleName,
      });

      const payload = jwtService.decode<Record<string, unknown>>(
        data.accessToken as string,
      );
      expect(payload).toMatchObject({
        accountType: 'ORGANIZATION',
        organizationId: orgId,
        role: roleName,
      });
    },
  );
});

describe('Auth (e2e) — US7 session lifecycle (refresh/logout/revocation)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let config: ConfigService;

  const email = 'session@platform.test';
  const password = 'ValidPass123';
  let userId: string;

  const loginCookie = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const cookieName = config.get<string>('jwt.refreshCookieName');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const cookie = setCookie.find((c) => c.startsWith(`${cookieName}=`));
    if (!cookie) {
      throw new Error('no refresh cookie set');
    }
    return cookie.split(';')[0];
  };

  const refresh = (cookie: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    config = app.get(ConfigService);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Session',
        lastName: 'User',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    userId = created.id;
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('refreshes the access token and rotates the refresh cookie', async () => {
    const cookie = await loginCookie();
    const firstToken = cookie.split('=')[1];

    const res = await refresh(cookie).expect(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(data.accessToken).toBeDefined();

    const cookieName = config.get<string>('jwt.refreshCookieName');
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const newCookie = setCookie.find((c) => c.startsWith(`${cookieName}=`));
    expect(newCookie).toBeDefined();
    const rotatedToken = newCookie?.split(';')[0].split('=')[1];
    expect(rotatedToken).toBeDefined();
    expect(rotatedToken).not.toBe(firstToken);
  });

  it('rejects a reused (rotated) refresh token with 400 and revokes the session', async () => {
    const cookie = await loginCookie();

    await refresh(cookie).expect(200);

    const reused = await refresh(cookie).expect(400);
    expect((reused.body as { error: { code: string } }).error.code).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );

    const again = await refresh(cookie).expect(400);
    expect((again.body as { error: { code: string } }).error.code).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );
  });

  it('revokes the session on logout; further refresh fails', async () => {
    const cookie = await loginCookie();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(200);

    const after = await refresh(cookie).expect(400);
    expect((after.body as { error: { code: string } }).error.code).toBe(
      'INVALID_OR_EXPIRED_TOKEN',
    );
  });

  it('returns 401 for a SUSPENDED user attempting renewal', async () => {
    const cookie = await loginCookie();

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    const res = await refresh(cookie).expect(401);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });
  });

  it('returns 401 for a deleted user attempting renewal', async () => {
    const cookie = await loginCookie();

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    const res = await refresh(cookie).expect(401);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null },
    });
  });
});

describe('Auth (e2e) — /auth/me (T059)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = 'me@platform.test';
  const password = 'ValidPass123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Me',
        lastName: 'User',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: { user: { email } },
    });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('returns the authenticated user profile and JWT context', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const accessToken = (login.body as { data: { accessToken: string } }).data
      .accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      data: {
        user: {
          email,
          firstName: 'Me',
          lastName: 'User',
          accountType: 'PLATFORM',
          organizationId: null,
          role: 'PLATFORM_OWNER',
          status: 'ACTIVE',
        },
      },
    });
  });

  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});

describe('Auth (e2e) — identity audit logging (T065)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = 'audit@platform.test';
  const password = 'ValidPass123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Audit',
        lastName: 'User',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({});
    await prisma.userSession.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('records a login success and a login failure without sensitive data', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const rows = await prisma.audit.findMany({
      where: { module: 'identity', action: { startsWith: 'auth.login' } },
    });

    expect(rows.some((r) => r.action === 'auth.login.success')).toBe(true);
    expect(rows.some((r) => r.action === 'auth.login.failure')).toBe(true);
    for (const row of rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      expect(metadata.password).toBeUndefined();
      expect(metadata.refreshToken).toBeUndefined();
      expect(metadata.accessToken).toBeUndefined();
    }
  });
});
