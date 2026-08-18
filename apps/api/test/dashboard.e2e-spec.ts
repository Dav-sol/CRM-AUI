process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Dashboard (e2e) — Flujo 09, US1..US4, FR-001..FR-005', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seedPrisma: PrismaService;
  let org1Id: string;
  let org2Id: string;
  let campaignNewUuid: string;
  let hash: string;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'dash-admin@org1.test',
    admin2: 'dash-admin2@org2.test',
    operador1: 'dash-op@org1.test',
  };

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const seedOrg = async (client: PrismaService, slug: string, name: string) => {
    const org = await client.organization.create({
      data: { name, slug },
      select: { id: true },
    });
    await client.role.createMany({
      data: [
        { organizationId: org.id, name: 'ADMINISTRADOR' },
        { organizationId: org.id, name: 'GERENTE' },
        { organizationId: org.id, name: 'OPERADOR' },
      ],
    });
    return org.id;
  };

  beforeAll(async () => {
    seedPrisma = new PrismaService();
    await seedPrisma.$connect();

    const slugs = ['dash-org-1', 'dash-org-2'];
    await seedPrisma.audit.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.message.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.conversation.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.automation.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.campaign.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.purchase.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.product.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await seedPrisma.role.deleteMany({
      where: { organization: { slug: { in: slugs } } },
    });
    await seedPrisma.organization.deleteMany({
      where: { slug: { in: slugs } },
    });

    org1Id = await seedOrg(seedPrisma, 'dash-org-1', 'Dash Org One');
    org2Id = await seedOrg(seedPrisma, 'dash-org-2', 'Dash Org Two');
    hash = await bcrypt.hash(password, 12);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const roles1 = await prisma.role.findMany({
      where: { organizationId: org1Id },
    });
    const role1ByName = new Map(roles1.map((r) => [r.name, r.id]));
    const roles2 = await prisma.role.findMany({
      where: { organizationId: org2Id },
    });
    const role2ByName = new Map(roles2.map((r) => [r.name, r.id]));

    await prisma.user.createMany({
      data: [
        {
          email: emails.admin1,
          passwordHash: hash,
          firstName: 'Dash',
          lastName: 'Admin1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('ADMINISTRADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.admin2,
          passwordHash: hash,
          firstName: 'Dash',
          lastName: 'Admin2',
          accountType: 'ORGANIZATION',
          organizationId: org2Id,
          roleId: role2ByName.get('ADMINISTRADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.operador1,
          passwordHash: hash,
          firstName: 'Dash',
          lastName: 'Operador',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('OPERADOR') as string,
          status: 'ACTIVE',
        },
      ],
    });

    const admin1 = await prisma.user.findUniqueOrThrow({
      where: { email: emails.admin1 },
      select: { id: true },
    });

    // ---- Org 1 seed (expected KPIs: customers 2/1, purchases 3/2,
    // automations.scheduled 2, messages.sent 2 / pending 1,
    // conversations.open 2, campaigns.active 2) ----
    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'DASH-A',
          name: 'Ana',
          phone: '51991000001',
          city: 'Lima',
          status: 'ACTIVE',
          createdAt: new Date('2026-08-02T10:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'DASH-B',
          name: 'Bruno',
          phone: '51991000002',
          city: 'Lima',
          status: 'ACTIVE',
          createdAt: new Date('2026-07-10T10:00:00.000Z'),
        },
        select: { id: true },
      }),
      // Soft-deleted: excluded from all counts
      prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'DASH-C',
          name: 'Carlos',
          phone: '51991000003',
          city: 'Arequipa',
          status: 'ACTIVE',
          createdAt: new Date('2026-07-05T10:00:00.000Z'),
          deletedAt: new Date('2026-08-01T10:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);

    const product1 = await prisma.product.create({
      data: {
        organizationId: org1Id,
        name: 'Plan Dash',
        code: 'DASH-PRO',
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    await prisma.purchase.createMany({
      data: [
        {
          organizationId: org1Id,
          customerId: customers[0].id,
          productId: product1.id,
          invoiceNumber: 'DASH-INV-1',
          purchaseDate: new Date('2026-08-05T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
        {
          organizationId: org1Id,
          customerId: customers[1].id,
          productId: product1.id,
          invoiceNumber: 'DASH-INV-2',
          purchaseDate: new Date('2026-08-10T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
        {
          organizationId: org1Id,
          customerId: customers[0].id,
          productId: product1.id,
          invoiceNumber: 'DASH-INV-3',
          purchaseDate: new Date('2026-07-20T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
        {
          organizationId: org1Id,
          customerId: customers[1].id,
          productId: product1.id,
          invoiceNumber: 'DASH-INV-4',
          purchaseDate: new Date('2026-07-15T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
          deletedAt: new Date('2026-08-01T10:00:00.000Z'),
        },
      ],
    });

    await prisma.automation.createMany({
      data: [
        {
          organizationId: org1Id,
          purchaseId: (
            await prisma.purchase.findFirstOrThrow({
              where: { organizationId: org1Id, invoiceNumber: 'DASH-INV-1' },
              select: { id: true },
            })
          ).id,
          scheduledDate: new Date('2026-08-20T10:00:00.000Z'),
          status: 'SCHEDULED',
        },
        {
          organizationId: org1Id,
          purchaseId: (
            await prisma.purchase.findFirstOrThrow({
              where: { organizationId: org1Id, invoiceNumber: 'DASH-INV-2' },
              select: { id: true },
            })
          ).id,
          scheduledDate: new Date('2026-08-21T10:00:00.000Z'),
          status: 'SCHEDULED',
        },
        {
          organizationId: org1Id,
          purchaseId: (
            await prisma.purchase.findFirstOrThrow({
              where: { organizationId: org1Id, invoiceNumber: 'DASH-INV-3' },
              select: { id: true },
            })
          ).id,
          scheduledDate: new Date('2026-07-25T10:00:00.000Z'),
          executedDate: new Date('2026-07-25T10:05:00.000Z'),
          status: 'EXECUTED',
        },
      ],
    });

    const conv1 = await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customers[0].id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
      },
      select: { id: true },
    });
    const conv2 = await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customers[1].id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
      },
      select: { id: true },
    });
    await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customers[1].id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'CLOSED',
      },
    });
    await prisma.message.createMany({
      data: [
        {
          organizationId: org1Id,
          conversationId: conv1.id,
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'SENT',
          content: 'Hola Ana',
        },
        {
          organizationId: org1Id,
          conversationId: conv2.id,
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'SENT',
          content: 'Hola Bruno',
        },
        {
          organizationId: org1Id,
          conversationId: conv2.id,
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'QUEUED',
          content: 'Pendiente',
        },
        {
          organizationId: org1Id,
          conversationId: conv1.id,
          type: 'AUTOMATIC',
          direction: 'OUTBOUND',
          status: 'FAILED',
          content: 'Fallida',
        },
      ],
    });

    const campaignNew = await prisma.campaign.create({
      data: {
        organizationId: org1Id,
        name: 'Dash Reciente',
        type: 'MANUAL',
        template: 'Hola {customerName}',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        startAt: new Date('2026-12-31T10:00:00.000Z'),
      },
      select: { uuid: true },
    });
    await prisma.campaign.create({
      data: {
        organizationId: org1Id,
        name: 'Dash Pasada',
        type: 'AUTOMATIC',
        template: 'Hola {customerName}',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-10T10:00:00.000Z'),
        startAt: new Date('2026-08-11T10:00:00.000Z'),
      },
    });
    await prisma.campaign.create({
      data: {
        organizationId: org1Id,
        name: 'Dash Borrador',
        type: 'MANUAL',
        template: 'Hola {customerName}',
        status: 'DRAFT',
        createdAt: new Date('2026-08-11T10:00:00.000Z'),
      },
    });
    campaignNewUuid = campaignNew.uuid;

    await prisma.audit.createMany({
      data: [
        {
          organizationId: org1Id,
          userId: admin1.id,
          module: 'dashboard',
          action: 'dashboard.seed',
          description: 'Actividad más reciente',
          metadata: { campaignUuid: campaignNewUuid },
          createdAt: new Date('2026-08-18T12:00:00.000Z'),
        },
        {
          organizationId: org1Id,
          userId: admin1.id,
          module: 'campaigns',
          action: 'campaign.activate',
          description: 'Campaña activada',
          createdAt: new Date('2026-08-18T11:00:00.000Z'),
        },
        {
          organizationId: org1Id,
          userId: null,
          module: 'customers',
          action: 'customer.create',
          description: null,
          createdAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ],
    });

    // ---- Org 2 seed (isolation baseline: 1 customer, 1 purchase, no
    // campaigns/conversations/messages/automations) ----
    const customer2 = await prisma.customer.create({
      data: {
        organizationId: org2Id,
        codcli: 'DASH2-A',
        name: 'Org2 Cliente',
        phone: '51992000001',
        city: 'Lima',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
      },
      select: { id: true },
    });
    const product2 = await prisma.product.create({
      data: {
        organizationId: org2Id,
        name: 'Plan Org2',
        code: 'DASH2-PRO',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await prisma.purchase.create({
      data: {
        organizationId: org2Id,
        customerId: customer2.id,
        productId: product2.id,
        invoiceNumber: 'DASH2-INV-1',
        purchaseDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: 1,
        value: 1990,
      },
    });
    const admin2 = await prisma.user.findUniqueOrThrow({
      where: { email: emails.admin2 },
      select: { id: true },
    });
    await prisma.audit.create({
      data: {
        organizationId: org2Id,
        userId: admin2.id,
        module: 'customers',
        action: 'customer.create',
        createdAt: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await seedPrisma.$disconnect();
  });

  it('D1 — summary returns org-scoped KPIs with HG-3 semantics', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((res.body as { data: unknown }).data).toEqual({
      customers: { total: 2, newThisMonth: 1 },
      purchases: { total: 3, thisMonth: 2 },
      automations: { scheduled: 2 },
      messages: { sent: 2, pending: 1 },
      conversations: { open: 2 },
      campaigns: { active: 2 },
    });
  });

  it('D2 — campaigns returns recent (createdAt desc) and upcoming (ACTIVE, startAt future)', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: {
        recent: { uuid: string; name: string; status: string }[];
        upcoming: { uuid: string; name: string; status: string }[];
      };
    };
    expect(body.data.recent).toHaveLength(3);
    expect(body.data.recent[0]).toEqual(
      expect.objectContaining({
        uuid: campaignNewUuid,
        name: 'Dash Reciente',
        status: 'ACTIVE',
      }),
    );
    expect(body.data.upcoming).toHaveLength(1);
    expect(body.data.upcoming[0]).toEqual(
      expect.objectContaining({
        name: 'Dash Reciente',
        status: 'ACTIVE',
      }),
    );
  });

  it('D3 — activity returns the last audit entries with composed user names', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: {
        module: string;
        action: string;
        description: string | null;
        userName: string | null;
        createdAt: string;
      }[];
    };
    expect(body.data.length).toBeGreaterThanOrEqual(4);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        module: 'identity',
        action: 'auth.login.success',
      }),
    );
    const actions = body.data.map((item) => item.action);
    const seedIndex = actions.indexOf('dashboard.seed');
    const activateIndex = actions.indexOf('campaign.activate');
    const createIndex = actions.indexOf('customer.create');
    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeLessThan(activateIndex);
    expect(activateIndex).toBeLessThan(createIndex);
    expect(body.data[seedIndex]).toEqual(
      expect.objectContaining({
        module: 'dashboard',
        action: 'dashboard.seed',
        description: 'Actividad más reciente',
        userName: 'Dash Admin1',
      }),
    );
    expect(body.data[activateIndex]).toEqual(
      expect.objectContaining({
        module: 'campaigns',
        action: 'campaign.activate',
        userName: 'Dash Admin1',
      }),
    );
    expect(body.data[createIndex]).toEqual(
      expect.objectContaining({
        module: 'customers',
        action: 'customer.create',
        userName: null,
      }),
    );
    expect(new Date(body.data[seedIndex].createdAt).getTime()).toBeGreaterThan(
      new Date(body.data[activateIndex].createdAt).getTime(),
    );
    expect(
      new Date(body.data[activateIndex].createdAt).getTime(),
    ).toBeGreaterThan(new Date(body.data[createIndex].createdAt).getTime());
  });

  it('D4 — tenant isolation: org2 never sees org1 data', async () => {
    const token = await login(emails.admin2);
    const summary = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((summary.body as { data: unknown }).data).toEqual({
      customers: { total: 1, newThisMonth: 1 },
      purchases: { total: 1, thisMonth: 1 },
      automations: { scheduled: 0 },
      messages: { sent: 0, pending: 0 },
      conversations: { open: 0 },
      campaigns: { active: 0 },
    });

    const campaigns = await request(app.getHttpServer())
      .get('/api/v1/dashboard/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (campaigns.body as { data: { recent: unknown[]; upcoming: unknown[] } })
        .data,
    ).toEqual({ recent: [], upcoming: [] });

    const activity = await request(app.getHttpServer())
      .get('/api/v1/dashboard/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const feed = (activity.body as { data: { module: string }[] }).data;
    expect(feed).toHaveLength(2);
    expect(feed.map((item) => item.module)).toEqual(['identity', 'customers']);
  });

  it('D5 — unauthenticated requests are rejected (401)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/campaigns')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/activity')
      .expect(401);
  });

  it('D6 — any organization role can read the dashboard (OPERADOR)', async () => {
    const token = await login(emails.operador1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (res.body as { data: { customers: { total: number } } }).data.customers
        .total,
    ).toBe(2);
  });
});
