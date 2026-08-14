import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Invitations (e2e) — US4 PLATFORM_OWNER + US5 ADMINISTRADOR', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const ownerEmail = 'inv-owner@platform.test';
  const ownerPassword = 'ValidPass123';
  const inviteeEmail = 'invitee@org1.test';
  const inviteePassword = 'InviteePass123';
  let ownerId: string;
  let org1Id: string;
  let org2Id: string;
  let roleOperadorId: string;

  const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

  const loginOwner = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password: ownerPassword });

  const seedInvitation = (rawToken: string, opts?: { expired?: boolean }) =>
    prisma.invitation.create({
      data: {
        organizationId: org1Id,
        invitedById: ownerId,
        email: `seed-${inviteeEmail}`,
        roleId: roleOperadorId,
        tokenHash: hashToken(rawToken),
        status: 'PENDING',
        expiresAt: new Date(
          opts?.expired ? Date.now() - 60_000 : Date.now() + 3600_000,
        ),
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

    await prisma.invitation.deleteMany({});
    await prisma.userSession.deleteMany({
      where: {
        user: {
          OR: [
            { email: { contains: 'invitee' } },
            { email: ownerEmail },
            { email: 'admin-inv@org1.test' },
            { email: { endsWith: '-inv@org1.test' } },
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: 'invitee' } },
          { email: ownerEmail },
          { email: 'admin-inv@org1.test' },
          { email: { endsWith: '-inv@org1.test' } },
        ],
      },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['inv-org-1', 'inv-org-2'] } },
    });

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash: await bcrypt.hash(ownerPassword, 12),
        firstName: 'Platform',
        lastName: 'Owner',
        accountType: 'PLATFORM',
        organizationId: null,
        roleId: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    ownerId = owner.id;

    const org1 = await prisma.organization.create({
      data: { name: 'Inv Org One', slug: 'inv-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Inv Org Two', slug: 'inv-org-2' },
      select: { id: true },
    });
    org2Id = org2.id;

    const operador = await prisma.role.create({
      data: { organizationId: org1Id, name: 'OPERADOR' },
      select: { id: true },
    });
    roleOperadorId = operador.id;
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: {
        user: {
          OR: [
            { email: { contains: 'invitee' } },
            { email: ownerEmail },
            { email: 'admin-inv@org1.test' },
            { email: { endsWith: '-inv@org1.test' } },
          ],
        },
      },
    });
    await prisma.invitation.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: 'invitee' } },
          { email: ownerEmail },
          { email: 'admin-inv@org1.test' },
          { email: { endsWith: '-inv@org1.test' } },
        ],
      },
    });
    await prisma.role.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [org1Id, org2Id] } },
    });
    await app.close();
  });

  describe('US4 - PLATFORM_OWNER invitation', () => {
    it('creates an invitation to any organization', async () => {
      const ownerToken = await loginOwner().expect(200);
      const accessToken = (ownerToken.body as { data: { accessToken: string } })
        .data.accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: inviteeEmail,
          roleId: roleOperadorId,
          organizationId: org1Id,
        })
        .expect(201);

      const data = (res.body as { data: { id: string; email: string } }).data;
      expect(data.email).toBe(inviteeEmail);
      expect(data.id).toBeDefined();
    });

    it('returns 409 for a duplicate pending invitation to the same email', async () => {
      const ownerToken = await loginOwner().expect(200);
      const accessToken = (ownerToken.body as { data: { accessToken: string } })
        .data.accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: inviteeEmail,
          roleId: roleOperadorId,
          organizationId: org1Id,
        })
        .expect(409);

      expect(res.body).toMatchObject({ error: { code: 'CONFLICT' } });
    });

    it('rejects unauthenticated invitation creation with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .send({
          email: 'nobody@org1.test',
          roleId: roleOperadorId,
          organizationId: org1Id,
        })
        .expect(401);

      expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });

    it('accepts the invitation: user INVITED→ACTIVE with org and role, session starts, token invalidated', async () => {
      const rawToken = 'accept-token-xyz';
      await seedInvitation(rawToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: rawToken, password: inviteePassword })
        .expect(201);

      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.accessToken).toBeDefined();
      expect(data.user).toMatchObject({
        email: `seed-${inviteeEmail}`,
        accountType: 'ORGANIZATION',
        organizationId: org1Id,
        role: 'OPERADOR',
      });

      const user = await prisma.user.findFirst({
        where: { email: `seed-${inviteeEmail}` },
      });
      expect(user?.status).toBe('ACTIVE');
      expect(user?.organizationId).toBe(org1Id);
      expect(user?.roleId).toBe(roleOperadorId);

      const invitation = await prisma.invitation.findFirst({
        where: { tokenHash: hashToken(rawToken) },
      });
      expect(invitation?.status).toBe('ACCEPTED');

      const again = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: rawToken, password: 'AnotherPass123' })
        .expect(400);
      expect(again.body).toMatchObject({
        error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
      });

      await prisma.userSession.deleteMany({ where: { userId: user!.id } });
      await prisma.user.delete({ where: { id: user!.id } });
    });

    it('rejects an expired invitation token with 400', async () => {
      const rawToken = 'expired-invite-token';
      await seedInvitation(rawToken, { expired: true });

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: rawToken, password: 'AnotherPass123' })
        .expect(400);

      expect(res.body).toMatchObject({
        error: { code: 'INVALID_OR_EXPIRED_TOKEN' },
      });
    });
  });

  describe('US5 - ADMINISTRADOR invitation', () => {
    beforeAll(async () => {
      const adminRole = await prisma.role.create({
        data: { organizationId: org1Id, name: 'ADMINISTRADOR' },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          email: 'admin-inv@org1.test',
          passwordHash: await bcrypt.hash('AdminPass123', 12),
          firstName: 'Org',
          lastName: 'Admin',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: adminRole.id,
          status: 'ACTIVE',
        },
      });
    });

    it('invites within the own organization (201)', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin-inv@org1.test', password: 'AdminPass123' })
        .expect(200);
      const accessToken = (login.body as { data: { accessToken: string } }).data
        .accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'own-invitee@org1.test',
          roleId: roleOperadorId,
          organizationId: org1Id,
        })
        .expect(201);

      expect((res.body as { data: { email: string } }).data.email).toBe(
        'own-invitee@org1.test',
      );
    });

    it('is forbidden from inviting into another organization (403)', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin-inv@org1.test', password: 'AdminPass123' })
        .expect(200);
      const accessToken = (login.body as { data: { accessToken: string } }).data
        .accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'foreign@org2.test',
          roleId: roleOperadorId,
          organizationId: org2Id,
        })
        .expect(403);

      expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    });
  });

  describe('US6 - GERENTE/OPERADOR cannot invite', () => {
    it.each(['GERENTE', 'OPERADOR'])(
      'forbids %s from inviting (403)',
      async (roleName) => {
        const email = `${roleName.toLowerCase()}-inv@org1.test`;
        const role = await prisma.role.upsert({
          where: {
            organizationId_name: {
              organizationId: org1Id,
              name: roleName as 'GERENTE',
            },
          },
          update: {},
          create: {
            organizationId: org1Id,
            name: roleName as 'GERENTE',
          },
          select: { id: true },
        });
        await prisma.user.create({
          data: {
            email,
            passwordHash: await bcrypt.hash('GerentePass123', 12),
            firstName: 'Org',
            lastName: roleName,
            accountType: 'ORGANIZATION',
            organizationId: org1Id,
            roleId: role.id,
            status: 'ACTIVE',
          },
        });

        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'GerentePass123' })
          .expect(200);
        const accessToken = (login.body as { data: { accessToken: string } })
          .data.accessToken;

        const res = await request(app.getHttpServer())
          .post('/api/v1/invitations')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            email: 'blocked@org1.test',
            roleId: roleOperadorId,
            organizationId: org1Id,
          })
          .expect(403);

        expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      },
    );
  });
});
