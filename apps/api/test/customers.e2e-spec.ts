import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

interface CustomerRow {
  id: string;
  uuid: string;
  codcli: string;
  name: string;
  organizationId: string;
  status: string;
  createdAt: string | Date;
  createdBy: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

describe('Customers (e2e) — US1..US7', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'cust-admin@org1.test',
    gerente1: 'cust-gerente@org1.test',
    operador1: 'cust-operador@org1.test',
    admin2: 'cust-admin2@org2.test',
    owner: 'cust-owner@platform.test',
  };
  let org1Id: string;
  let org2Id: string;
  let org1Customers: CustomerRow[];

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const createCustomer = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.audit.deleteMany({ where: { module: 'customers' } });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['cust-org-1', 'cust-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organization: { slug: { in: ['cust-org-1', 'cust-org-2'] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['cust-org-1', 'cust-org-2'] } },
    });

    const org1 = await prisma.organization.create({
      data: { name: 'Cust Org One', slug: 'cust-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Cust Org Two', slug: 'cust-org-2' },
      select: { id: true },
    });
    org2Id = org2.id;

    const role1 = await prisma.role.createMany({
      data: [
        { organizationId: org1Id, name: 'ADMINISTRADOR' },
        { organizationId: org1Id, name: 'GERENTE' },
        { organizationId: org1Id, name: 'OPERADOR' },
      ],
    });
    expect(role1.count).toBe(3);
    const roles1 = await prisma.role.findMany({
      where: { organizationId: org1Id },
    });
    const roleByName = new Map(roles1.map((r) => [r.name, r.id]));
    const role2 = await prisma.role.create({
      data: { organizationId: org2Id, name: 'ADMINISTRADOR' },
      select: { id: true },
    });

    const hash = await bcrypt.hash(password, 12);
    const createUser = (
      email: string,
      organizationId: string | null,
      roleId: string | null,
      accountType: 'ORGANIZATION' | 'PLATFORM',
    ) =>
      prisma.user.create({
        data: {
          email,
          passwordHash: hash,
          firstName: 'Cust',
          lastName: email.split('@')[0],
          accountType,
          organizationId,
          roleId,
          status: 'ACTIVE',
        },
      });

    await createUser(
      emails.admin1,
      org1Id,
      roleByName.get('ADMINISTRADOR') as string,
      'ORGANIZATION',
    );
    await createUser(
      emails.gerente1,
      org1Id,
      roleByName.get('GERENTE') as string,
      'ORGANIZATION',
    );
    await createUser(
      emails.operador1,
      org1Id,
      roleByName.get('OPERADOR') as string,
      'ORGANIZATION',
    );
    await createUser(emails.admin2, org2Id, role2.id, 'ORGANIZATION');
    await createUser(emails.owner, null, null, 'PLATFORM');

    org1Customers = [
      await prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'CUST-0001',
          name: 'Juan Pérez',
          phone: '0991234567',
          email: 'juan@org1.test',
          city: 'Quito',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-15T10:00:00Z'),
        },
      }),
      await prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'CUST-0002',
          name: 'María López',
          city: 'Guayaquil',
          status: 'ACTIVE',
          createdAt: new Date('2026-02-15T10:00:00Z'),
        },
      }),
      await prisma.customer.create({
        data: {
          organizationId: org1Id,
          codcli: 'CUST-0003',
          name: 'Carlos Ruiz',
          city: 'Quito',
          status: 'INACTIVE',
          createdAt: new Date('2026-03-15T10:00:00Z'),
        },
      }),
    ];
    await prisma.customer.create({
      data: {
        organizationId: org2Id,
        codcli: 'CUST-0001',
        name: 'Otro Cliente',
        city: 'Cuenca',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { module: 'customers' } });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['cust-org-1', 'cust-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [org1Id, org2Id] } },
    });
    await app.close();
  });

  it('lists only the organization customers with pagination meta (AS-001)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/customers?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: CustomerRow[];
      meta: { page: number; limit: number; total: number; pages: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.data.map((c) => c.organizationId)).not.toContain(org2Id);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
  });

  it('applies search, status, city filters and sort (AS-002, AS-003)', async () => {
    const token = await login(emails.admin1);

    const search = await request(app.getHttpServer())
      .get('/api/v1/customers?search=juan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (search.body as { data: CustomerRow[] }).data.map((c) => c.codcli),
    ).toEqual(['CUST-0001']);

    const byCity = await request(app.getHttpServer())
      .get('/api/v1/customers?city=quito')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byCity.body as { data: CustomerRow[] }).data.map((c) => c.codcli).sort(),
    ).toEqual(['CUST-0001', 'CUST-0003']);

    const byStatus = await request(app.getHttpServer())
      .get('/api/v1/customers?status=INACTIVE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byStatus.body as { data: CustomerRow[] }).data.map((c) => c.codcli),
    ).toEqual(['CUST-0003']);

    const newestFirst = await request(app.getHttpServer())
      .get('/api/v1/customers?sort=-createdAt')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((newestFirst.body as { data: CustomerRow[] }).data[0].codcli).toBe(
      'CUST-0003',
    );
  });

  it('returns a customer by id within the organization (AS-001)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/customers/${org1Customers[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const customer = (res.body as { data: CustomerRow }).data;
    expect(customer.codcli).toBe('CUST-0001');
    expect(customer.email).toBe('juan@org1.test');
  });

  it('returns 404 for unknown customer ids', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/customers/cust-does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body).toMatchObject({
      error: { code: 'CUSTOMER_NOT_FOUND' },
    });
  });

  it('creates a customer with createdBy from the JWT and rejects duplicates (AS-006, AS-007)', async () => {
    const token = await login(emails.admin1);

    const created = await createCustomer(token, {
      codcli: 'CUST-0100',
      name: 'Nueva Cliente',
      phone: '0999999999',
      city: 'Quito',
    }).expect(201);

    const data = (created.body as { data: CustomerRow }).data;
    expect(data.status).toBe('ACTIVE');
    expect(data.createdBy).toBeTruthy();

    const dup = await createCustomer(token, {
      codcli: 'CUST-0100',
      name: 'Duplicada',
    }).expect(409);
    expect(dup.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'A customer with this codcli already exists',
      },
    });
  });

  it('rejects organization users that send organizationId (AS-011)', async () => {
    const token = await login(emails.admin1);

    const res = await createCustomer(token, {
      codcli: 'CUST-0200',
      name: 'Mal',
      organizationId: org2Id,
    }).expect(400);

    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('updates contact fields but never codcli (AS-012, AS-013)', async () => {
    const token = await login(emails.admin1);
    const id = org1Customers[1].id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0987654321' })
      .expect(200);

    expect((updated.body as { data: { phone: string } }).data.phone).toBe(
      '0987654321',
    );

    const immutable = await request(app.getHttpServer())
      .patch(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ codcli: 'CUST-9999' })
      .expect(400);
    expect(immutable.body).toMatchObject({
      error: 'Bad Request',
      message: ['codcli is immutable and cannot be updated'],
    });
  });

  it('enforces OPERADOR read-only on all writes (AS-008)', async () => {
    const token = await login(emails.operador1);
    const id = org1Customers[0].id;

    await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const create = await createCustomer(token, {
      codcli: 'CUST-0300',
      name: 'No',
    }).expect(403);
    expect(create.body).toMatchObject({ error: { code: 'FORBIDDEN' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('isolates tenants: org2 cannot read, update, or delete org1 customers (AS-005)', async () => {
    const token = await login(emails.admin2);
    const id = org1Customers[0].id;

    const get = await request(app.getHttpServer())
      .get(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(get.body).toMatchObject({ error: { code: 'CUSTOMER_NOT_FOUND' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('soft-deletes a customer and hides it from queries (AS-014, AS-015)', async () => {
    const token = await login(emails.gerente1);
    const id = org1Customers[2].id;

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(deleted.body).toEqual({ data: { success: true } });

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: CustomerRow[] }).data.map((c) => c.id),
    ).not.toContain(id);

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets PLATFORM_OWNER operate cross-org with a validated organizationId (AS-009, AS-010)', async () => {
    const token = await login(emails.owner);

    const list = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: CustomerRow[] }).data.some(
        (c) => c.codcli === 'CUST-0001' && c.city === 'Cuenca',
      ),
    ).toBe(true);

    const created = await createCustomer(token, {
      codcli: 'CUST-PLAT-1',
      name: 'De Plataforma',
      organizationId: org1Id,
    }).expect(201);
    expect((created.body as { data: CustomerRow }).data.status).toBe('ACTIVE');

    const missing = await createCustomer(token, {
      codcli: 'CUST-PLAT-2',
      name: 'Sin Org',
    }).expect(400);
    expect(missing.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const unknown = await createCustomer(token, {
      codcli: 'CUST-PLAT-3',
      name: 'Org Desconocida',
      organizationId: 'org-no-existe',
    }).expect(400);
    expect(unknown.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects unauthenticated requests with 401 (AS-016)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers')
      .expect(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('records customer write operations in the audit log (AS-017, FR-012)', async () => {
    const rows = await prisma.audit.findMany({
      where: { module: 'customers' },
    });

    expect(
      rows.some(
        (r) =>
          r.action === 'customer.create.success' &&
          r.organizationId === org1Id &&
          r.userId !== null,
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'customer.update.success' && r.organizationId === org1Id,
      ),
    ).toBe(true);
    expect(rows.some((r) => r.action === 'customer.delete.success')).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'customer.create.failure' &&
          (r.metadata as { reason?: string })?.reason === 'duplicate_codcli',
      ),
    ).toBe(true);
  });
});
