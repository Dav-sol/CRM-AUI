process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

describe('Campaigns (e2e) — Flujo 08, US1..US8, FR-001..FR-010', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seedPrisma: PrismaService;
  let org1Id: string;
  let org2Id: string;
  let product1Id: string;
  let product1Uuid: string;
  let product2Id: string;
  let hash: string;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'camp-admin@org1.test',
    admin2: 'camp-admin2@org2.test',
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

    await seedPrisma.audit.deleteMany({ where: { module: 'campaigns' } });
    await seedPrisma.automation.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.campaign.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.product.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await seedPrisma.role.deleteMany({
      where: { organization: { slug: { in: ['camp-org-1', 'camp-org-2'] } } },
    });
    await seedPrisma.organization.deleteMany({
      where: { slug: { in: ['camp-org-1', 'camp-org-2'] } },
    });

    org1Id = await seedOrg(seedPrisma, 'camp-org-1', 'Camp Org One');
    org2Id = await seedOrg(seedPrisma, 'camp-org-2', 'Camp Org Two');
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
    const admin2Role = roles2.find((r) => r.name === 'ADMINISTRADOR');

    await prisma.user.createMany({
      data: [
        {
          email: emails.admin1,
          passwordHash: hash,
          firstName: 'Camp',
          lastName: 'Admin1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('ADMINISTRADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.admin2,
          passwordHash: hash,
          firstName: 'Camp',
          lastName: 'Admin2',
          accountType: 'ORGANIZATION',
          organizationId: org2Id,
          roleId: admin2Role?.id ?? null,
          status: 'ACTIVE',
        },
      ],
    });

    const product1 = await prisma.product.create({
      data: {
        organizationId: org1Id,
        name: 'Plan Premium',
        code: 'PREMIUM',
        status: 'ACTIVE',
      },
      select: { id: true, uuid: true },
    });
    product1Id = product1.id;
    product1Uuid = product1.uuid;
    product2Id = (
      await prisma.product.create({
        data: {
          organizationId: org1Id,
          name: 'Plan Basico',
          code: 'BASIC',
          status: 'ACTIVE',
        },
      })
    ).id;

    // Customers: A (Lima, premium), B (Lima, basic x2), C (Arequipa, premium)
    const customers = [
      { codcli: 'CAMP-A', name: 'Ana', phone: '51990000001', city: 'Lima' },
      { codcli: 'CAMP-B', name: 'Bruno', phone: '51990000002', city: 'Lima' },
      {
        codcli: 'CAMP-C',
        name: 'Carlos',
        phone: '51990000003',
        city: 'Arequipa',
      },
    ];
    const customerIds: string[] = [];
    for (const c of customers) {
      customerIds.push(
        (
          await prisma.customer.create({
            data: { organizationId: org1Id, ...c, status: 'ACTIVE' },
            select: { id: true },
          })
        ).id,
      );
    }
    await prisma.purchase.createMany({
      data: [
        {
          organizationId: org1Id,
          customerId: customerIds[0],
          productId: product1Id,
          invoiceNumber: 'CAMP-INV-1',
          purchaseDate: new Date('2026-07-10T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
        {
          organizationId: org1Id,
          customerId: customerIds[1],
          productId: product1Id,
          invoiceNumber: 'CAMP-INV-2',
          purchaseDate: new Date('2026-07-11T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
        {
          organizationId: org1Id,
          customerId: customerIds[1],
          productId: product2Id,
          invoiceNumber: 'CAMP-INV-3',
          purchaseDate: new Date('2026-07-12T12:00:00.000Z'),
          quantity: 1,
          value: 1990,
        },
        {
          organizationId: org1Id,
          customerId: customerIds[2],
          productId: product1Id,
          invoiceNumber: 'CAMP-INV-4',
          purchaseDate: new Date('2026-07-13T12:00:00.000Z'),
          quantity: 1,
          value: 9990,
        },
      ],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (seedPrisma) {
      await seedPrisma.$disconnect();
    }
  });

  it('C1 — creates a campaign as DRAFT', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Reactivación Lima',
        description: 'Campaña de reactivación',
        type: 'REPURCHASE',
        template: 'Hola {customerName}, vuelve por {productName}',
        segment: { city: 'Lima', productId: product1Uuid },
      })
      .expect(201);

    expect((res.body as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({
        name: 'Reactivación Lima',
        status: 'DRAFT',
        organizationId: org1Id,
      }),
    );
    expect(
      (res.body as { data: Record<string, unknown> }).data.uuid,
    ).toBeTruthy();
  });

  it('C1b — rejects campaigns with empty segment', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Campaña inválida',
        type: 'MANUAL',
        template: 'Hola',
        segment: {},
      })
      .expect(400);

    // Pipe validation errors surface with the class-validator shape.
    expect((res.body as { message: unknown[] }).message).toEqual(
      expect.arrayContaining([
        expect.stringContaining('at least one criterion'),
      ]),
    );
  });

  it('C2 — updates a campaign only while DRAFT', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Borrador',
        type: 'MANUAL',
        template: 'Hola {customerName}',
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/campaigns/${uuid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Borrador v2', startAt: '2026-09-01T10:00:00.000Z' })
      .expect(200);

    expect((updated.body as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ uuid, name: 'Borrador v2', status: 'DRAFT' }),
    );
  });

  it('C3 — previews the segment as a dry-run', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Preview me',
        type: 'AUTOMATIC',
        template: 'Hola {customerName}',
        segment: { city: 'Lima', productId: product1Uuid },
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/preview-segment`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Ana + Bruno (Lima) own product1; one automation per customer.
    expect((res.body as { data: Record<string, unknown> }).data).toEqual({
      count: 2,
    });
  });

  it('C4 — activates a campaign and generates one automation per customer', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Actívame',
        type: 'REPURCHASE',
        template: 'Hola {customerName}',
        segment: { city: 'Lima', productId: product1Uuid },
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((res.body as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ uuid, status: 'ACTIVE', automationCount: 2 }),
    );

    const automations = await prisma.automation.findMany({
      where: { campaign: { uuid } },
    });
    expect(automations).toHaveLength(2);
    expect(automations.every((a) => a.status === 'SCHEDULED')).toBe(true);
  });

  it('C4b — rejects activation from a non-DRAFT state', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ya activada',
        type: 'MANUAL',
        template: 'Hola {customerName}',
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;

    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('C5 — pauses an ACTIVE campaign', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pausame',
        type: 'MANUAL',
        template: 'Hola {customerName}',
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as { data: Record<string, unknown> }).data).toEqual({
      uuid,
      status: 'PAUSED',
    });
  });

  it('C6 — resumes a PAUSED campaign', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Reanudame',
        type: 'MANUAL',
        template: 'Hola {customerName}',
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as { data: Record<string, unknown> }).data).toEqual({
      uuid,
      status: 'ACTIVE',
    });
  });

  it('C7 — cancels a campaign and its pending automations', async () => {
    const token = await login(emails.admin1);
    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cancelame',
        type: 'REPURCHASE',
        template: 'Hola {customerName}',
        segment: { city: 'Lima', productId: product1Uuid },
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;
    await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${uuid}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as { data: Record<string, unknown> }).data).toEqual({
      uuid,
      status: 'CANCELLED',
    });

    const automations = await prisma.automation.findMany({
      where: { campaign: { uuid } },
    });
    expect(automations).toHaveLength(2);
    expect(automations.every((a) => a.status === 'CANCELLED')).toBe(true);
  });

  it('C8 — lists campaigns with stats and filters', async () => {
    const token = await login(emails.admin1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .query({ search: 'Cancelame', sort: 'name' })
      .expect(200);

    expect(
      (res.body as { meta: { total: number } }).meta.total,
    ).toBeGreaterThanOrEqual(1);
    expect((res.body as { data: Record<string, unknown> }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Cancelame',
          automationCount: 2,
          executedCount: 0,
        }),
      ]),
    );
  });

  it('C9 — enforces tenant isolation (cross-tenant 404) and detail', async () => {
    const token1 = await login(emails.admin1);
    const token2 = await login(emails.admin2);

    const created = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Solo org1',
        type: 'MANUAL',
        template: 'Hola {customerName}',
      })
      .expect(201);
    const uuid = (
      (created.body as { data: Record<string, unknown> }).data as {
        uuid: string;
      }
    ).uuid;

    await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${uuid}`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(404);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${uuid}`)
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    expect((detail.body as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({
        uuid,
        name: 'Solo org1',
        template: 'Hola {customerName}',
        status: 'DRAFT',
      }),
    );
  });
});
