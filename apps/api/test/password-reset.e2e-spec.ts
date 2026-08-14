import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Password reset (e2e) — US3', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = 'reset@org.test';
  const password = 'CurrentPass123';
  let userId: string;

  const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

  const seedResetToken = (rawToken: string, opts?: { used?: boolean }) =>
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: opts?.used ? new Date() : null,
      },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: 'Reset',
        lastName: 'User',
        accountType: 'ORGANIZATION',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    userId = created.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  const requestReset = (targetEmail: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: targetEmail });

  describe('request', () => {
    it('returns the generic message and issues a token for an ACTIVE user', async () => {
      const res = await requestReset(email).expect(200);
      expect(res.body).toMatchObject({
        data: {
          message:
            'If an account exists with that email, a password reset link has been sent',
        },
      });

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId },
      });
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });

    it('returns the identical generic message for an unknown email (no enumeration)', async () => {
      const known = await requestReset(email).expect(200);
      const unknown = await requestReset('unknown@org.test').expect(200);

      expect(unknown.body).toEqual(known.body);

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId },
      });
      expect(tokens.length).toBeGreaterThan(0);
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });

    it('returns the identical generic message for an INVITED user without a token', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'INVITED' },
      });

      const res = await requestReset(email).expect(200);
      expect(res.body).toMatchObject({
        data: {
          message:
            'If an account exists with that email, a password reset link has been sent',
        },
      });

      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId },
      });
      expect(tokens).toHaveLength(0);

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    });

    it('blocks a SUSPENDED user with 403 ACCOUNT_SUSPENDED', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'SUSPENDED' },
      });

      const res = await requestReset(email).expect(403);
      expect(res.body).toMatchObject({
        error: { code: 'ACCOUNT_SUSPENDED' },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    });

    it('blocks a deleted user with 403 ACCOUNT_DELETED', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      const res = await requestReset(email).expect(403);
      expect(res.body).toMatchObject({
        error: { code: 'ACCOUNT_DELETED' },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: null },
      });
    });
  });

  describe('confirm', () => {
    it('resets the password with a valid single-use token and invalidates it', async () => {
      const rawToken = 'reset-token-abc-123';
      await seedResetToken(rawToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, password: 'NewPass12345' })
        .expect(200);
      expect(res.body).toMatchObject({ data: { success: true } });

      const token = await prisma.passwordResetToken.findFirst({
        where: { userId },
      });
      expect(token?.usedAt).not.toBeNull();

      const updated = await prisma.user.findUnique({ where: { id: userId } });
      const valid = await bcrypt.compare('NewPass12345', updated!.passwordHash);
      expect(valid).toBe(true);

      const again = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: rawToken, password: 'AnotherPass123' })
        .expect(400);
      expect(again.body).toMatchObject({
        error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
      });

      await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });

    it('rejects an unknown token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: 'does-not-exist', password: 'NewPass12345' })
        .expect(400);
      expect(res.body).toMatchObject({
        error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
      });
    });

    it('rejects an expired token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      await prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken('expired-token'),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: 'expired-token', password: 'NewPass12345' })
        .expect(400);
      expect(res.body).toMatchObject({
        error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
      });

      await prisma.passwordResetToken.deleteMany({ where: { userId } });
    });
  });
});
