import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

interface ProductRow {
  id: string;
  uuid: string;
  code: string;
  name: string;
  category: string | null;
  status: string;
  organizationId: string;
  createdAt: string | Date;
  createdBy: string | null;
}

describe('Products (e2e) — US1..US7', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'prod-admin@org1.test',
    gerente1: 'prod-gerente@org1.test',
    operador1: 'prod-operador@org1.test',
    admin2: 'prod-admin2@org2.test',
    owner: 'prod-owner@platform.test',
  };
  let org1Id: string;
  let org2Id: string;
  let org1Products: ProductRow[];

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const createProduct = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/products')
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

    await prisma.audit.deleteMany({ where: { module: 'products' } });
    await prisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['prod-org-1', 'prod-org-2'] } } },
    });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['prod-org-1', 'prod-org-2'] } } },
    });
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: ['prod-org-1', 'prod-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organization: { slug: { in: ['prod-org-1', 'prod-org-2'] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['prod-org-1', 'prod-org-2'] } },
    });

    const org1 = await prisma.organization.create({
      data: { name: 'Prod Org One', slug: 'prod-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Prod Org Two', slug: 'prod-org-2' },
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
          firstName: 'Prod',
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

    org1Products = [
      await prisma.product.create({
        data: {
          organizationId: org1Id,
          code: 'PROD-0001',
          name: 'Batería X',
          category: 'Baterías',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-15T10:00:00Z'),
        },
      }),
      await prisma.product.create({
        data: {
          organizationId: org1Id,
          code: 'PROD-0002',
          name: 'Batería Y',
          category: 'Baterías',
          status: 'ACTIVE',
          createdAt: new Date('2026-02-15T10:00:00Z'),
        },
      }),
      await prisma.product.create({
        data: {
          organizationId: org1Id,
          code: 'PROD-0003',
          name: 'Cargador rápido',
          category: 'Accesorios',
          status: 'INACTIVE',
          createdAt: new Date('2026-03-15T10:00:00Z'),
        },
      }),
    ];
    await prisma.product.create({
      data: {
        organizationId: org2Id,
        code: 'PROD-0001',
        name: 'Batería X',
        category: 'Baterías',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { module: 'products' } });
    await prisma.purchase.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.customer.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.product.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
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

  it('lists only the organization products with pagination meta (AS-001)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/products?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: ProductRow[];
      meta: { page: number; limit: number; total: number; pages: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.data.map((p) => p.organizationId)).not.toContain(org2Id);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
  });

  it('applies search, status, category filters and sort (AS-002, AS-003)', async () => {
    const token = await login(emails.admin1);

    const search = await request(app.getHttpServer())
      .get('/api/v1/products?search=bater')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (search.body as { data: ProductRow[] }).data.map((p) => p.code).sort(),
    ).toEqual(['PROD-0001', 'PROD-0002']);

    const byCategory = await request(app.getHttpServer())
      .get('/api/v1/products?category=Accesorios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byCategory.body as { data: ProductRow[] }).data.map((p) => p.code),
    ).toEqual(['PROD-0003']);

    const byStatus = await request(app.getHttpServer())
      .get('/api/v1/products?status=INACTIVE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byStatus.body as { data: ProductRow[] }).data.map((p) => p.code),
    ).toEqual(['PROD-0003']);

    const newestFirst = await request(app.getHttpServer())
      .get('/api/v1/products?sort=-createdAt')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((newestFirst.body as { data: ProductRow[] }).data[0].code).toBe(
      'PROD-0003',
    );
  });

  it('applies the createdTo day-boundary filter (NR-008)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/products?createdTo=2026-02-15')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const codes = (res.body as { data: ProductRow[] }).data
      .map((p) => p.code)
      .sort();
    expect(codes).toEqual(['PROD-0001', 'PROD-0002']);
  });

  it('returns a product by id within the organization (AS-001)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${org1Products[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const product = (res.body as { data: ProductRow }).data;
    expect(product.code).toBe('PROD-0001');
    expect(product.category).toBe('Baterías');
  });

  it('returns 404 for unknown product ids (AS-004)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/products/prod-does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body).toMatchObject({
      error: { code: 'PRODUCT_NOT_FOUND' },
    });
  });

  it('creates a product with createdBy from the JWT and rejects duplicates (AS-005, AS-006)', async () => {
    const token = await login(emails.admin1);

    const created = await createProduct(token, {
      code: 'PROD-0100',
      name: 'Batería Nueva',
      category: 'Baterías',
    }).expect(201);

    const data = (created.body as { data: ProductRow }).data;
    expect(data.status).toBe('ACTIVE');
    expect(data.createdBy).toBeTruthy();

    const dup = await createProduct(token, {
      code: 'PROD-0100',
      name: 'Duplicada',
    }).expect(409);
    expect(dup.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'A product with this code already exists',
      },
    });
  });

  it('rejects organization users that send organizationId (AS-010)', async () => {
    const token = await login(emails.admin1);

    const res = await createProduct(token, {
      code: 'PROD-0200',
      name: 'Mal',
      organizationId: org2Id,
    }).expect(400);

    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('updates mutable fields but never code (AS-011, AS-012)', async () => {
    const token = await login(emails.admin1);
    const id = org1Products[1].id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Batería Y Pro', status: 'INACTIVE' })
      .expect(200);

    const data = (updated.body as { data: ProductRow }).data;
    expect(data.name).toBe('Batería Y Pro');
    expect(data.status).toBe('INACTIVE');

    const immutable = await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'PROD-9999' })
      .expect(400);
    expect(immutable.body).toMatchObject({
      error: 'Bad Request',
      message: ['code is immutable and cannot be updated'],
    });
  });

  it('enforces OPERADOR read-only on all writes incl. DELETE (AS-007)', async () => {
    const token = await login(emails.operador1);
    const id = org1Products[0].id;

    await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const create = await createProduct(token, {
      code: 'PROD-0300',
      name: 'No',
    }).expect(403);
    expect(create.body).toMatchObject({ error: { code: 'FORBIDDEN' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('isolates tenants: org2 cannot read, update, or delete org1 products (AS-004, AS-015)', async () => {
    const token = await login(emails.admin2);
    const id = org1Products[0].id;

    const get = await request(app.getHttpServer())
      .get(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(get.body).toMatchObject({ error: { code: 'PRODUCT_NOT_FOUND' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('soft-deletes a product and hides it from queries (AS-014, AS-015)', async () => {
    const token = await login(emails.gerente1);
    const id = org1Products[2].id;

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(deleted.body).toEqual({ data: { success: true } });

    const row = await prisma.product.findUnique({ where: { id } });
    expect(row?.deletedAt).toBeTruthy();
    expect(row?.deletedBy).toBeTruthy();

    await request(app.getHttpServer())
      .get(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: ProductRow[] }).data.map((p) => p.id),
    ).not.toContain(id);

    await request(app.getHttpServer())
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 409 when recreating the code of a soft-deleted product (R-008)', async () => {
    const token = await login(emails.admin1);

    const res = await createProduct(token, {
      code: 'PROD-0003',
      name: 'Reintento',
    }).expect(409);

    expect(res.body).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('keeps purchases historical summaries and rejects purchases on soft-deleted products (AS-018)', async () => {
    const token = await login(emails.admin1);
    const target = org1Products[0];

    const customer = await prisma.customer.create({
      data: {
        organizationId: org1Id,
        codcli: 'PROD-CUST-1',
        name: 'Cliente de Producto',
      },
      select: { id: true },
    });

    const purchase = await prisma.purchase.create({
      data: {
        organizationId: org1Id,
        customerId: customer.id,
        productId: target.id,
        invoiceNumber: 'PROD-INV-1',
        purchaseDate: new Date('2026-07-22T14:35:18Z'),
        quantity: 1,
        value: 10,
        createdBy: 'seed',
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const purchases = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const matching = (
      purchases.body as {
        data: { id: string; product: { id: string; code: string } }[];
      }
    ).data.find((p) => p.id === purchase.id);
    expect(matching?.product).toEqual({
      id: target.id,
      code: target.code,
      name: target.name,
    });

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        productId: target.id,
        invoiceNumber: 'PROD-INV-2',
        purchaseDate: '2026-07-23T14:35:18Z',
        quantity: 1,
        value: '10.00',
      })
      .expect(400);
    expect(rejected.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('lets PLATFORM_OWNER operate cross-org with a validated organizationId (AS-008, AS-009)', async () => {
    const token = await login(emails.owner);

    const list = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: ProductRow[] }).data.some(
        (p) => p.code === 'PROD-0001' && p.organizationId === org2Id,
      ),
    ).toBe(true);

    const created = await createProduct(token, {
      code: 'PROD-PLAT-1',
      name: 'De Plataforma',
      organizationId: org1Id,
    }).expect(201);
    expect((created.body as { data: ProductRow }).data.status).toBe('ACTIVE');

    const missing = await createProduct(token, {
      code: 'PROD-PLAT-2',
      name: 'Sin Org',
    }).expect(400);
    expect(missing.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const unknown = await createProduct(token, {
      code: 'PROD-PLAT-3',
      name: 'Org Desconocida',
      organizationId: 'org-no-existe',
    }).expect(400);
    expect(unknown.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects unauthenticated requests with 401 (AS-016)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .expect(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('records product write operations in the audit log (AS-017, FR-011)', async () => {
    const rows = await prisma.audit.findMany({
      where: { module: 'products' },
    });

    expect(
      rows.some(
        (r) =>
          r.action === 'product.create.success' &&
          r.organizationId === org1Id &&
          r.userId !== null,
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'product.update.success' && r.organizationId === org1Id,
      ),
    ).toBe(true);
    expect(rows.some((r) => r.action === 'product.delete.success')).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'product.create.failure' &&
          (r.metadata as { reason?: string })?.reason === 'duplicate_code',
      ),
    ).toBe(true);
  });
});
