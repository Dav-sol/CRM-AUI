import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Tenant isolation (e2e) — US8', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const ownerEmail = 'iso-owner@platform.test';
  const ownerPassword = 'ValidPass123';
  const orgUserEmail = 'iso-admin@org1.test';
  const orgUserPassword = 'ValidPass123';
  let org1Id: string;
  let org2Id: string;

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.userSession.deleteMany({
      where: {
        user: {
          OR: [{ email: ownerEmail }, { email: orgUserEmail }],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ email: ownerEmail }, { email: orgUserEmail }] },
    });
    await prisma.role.deleteMany({
      where: {
        organization: { slug: { in: ['iso-org-1', 'iso-org-2'] } },
      },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['iso-org-1', 'iso-org-2'] } },
    });

    const org1 = await prisma.organization.create({
      data: { name: 'Iso Org One', slug: 'iso-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Iso Org Two', slug: 'iso-org-2' },
      select: { id: true },
    });
    org2Id = org2.id;

    const adminRole = await prisma.role.create({
      data: { organizationId: org1Id, name: 'ADMINISTRADOR' },
      select: { id: true },
    });

    const hash = await bcrypt.hash(orgUserPassword, 12);
    await prisma.user.create({
      data: {
        email: orgUserEmail,
        passwordHash: hash,
        firstName: 'Org',
        lastName: 'Admin',
        accountType: 'ORGANIZATION',
        organizationId: org1Id,
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });
    await prisma.user.create({
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
    });
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: {
        user: {
          OR: [{ email: ownerEmail }, { email: orgUserEmail }],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ email: ownerEmail }, { email: orgUserEmail }] },
    });
    await prisma.role.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [org1Id, org2Id] } },
    });
    await app.close();
  });

  it('allows an organization user to read its own organization', async () => {
    const accessToken = await login(orgUserEmail, orgUserPassword);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${org1Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect((res.body as { data: { id: string } }).data.id).toBe(org1Id);
  });

  it('forbids an organization user from reading another organization (403)', async () => {
    const accessToken = await login(orgUserEmail, orgUserPassword);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${org2Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('allows a PLATFORM_OWNER to read any organization resource', async () => {
    const accessToken = await login(ownerEmail, ownerPassword);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${org2Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect((res.body as { data: { id: string } }).data.id).toBe(org2Id);
  });

  it('rejects unauthenticated access with 401', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${org1Id}`)
      .expect(401);

    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});
