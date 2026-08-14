import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

interface PurchaseRow {
  id: string;
  uuid: string;
  invoiceNumber: string;
  purchaseDate: string | Date;
  quantity: number;
  value: string;
  status: string;
  organizationId: string;
  createdBy: string | null;
  customer?: { id: string; codcli: string; name: string } | null;
  product?: { id: string; code: string; name: string } | null;
}

describe('Purchases (e2e) — US1..US6', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'purch-admin@org1.test',
    gerente1: 'purch-gerente@org1.test',
    operador1: 'purch-operador@org1.test',
    admin2: 'purch-admin2@org2.test',
    owner: 'purch-owner@platform.test',
  };
  let org1Id: string;
  let org2Id: string;
  let org1Purchases: { id: string }[];
  let org1Customers: { id: string; codcli: string; name: string }[];
  let org1Products: { id: string; code: string; name: string }[];

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const createPurchase = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const seedProduct = (organizationId: string, code: string, name: string) =>
    prisma.product.create({
      data: { organizationId, code, name },
      select: { id: true, code: true, name: true },
    });

  const seedCustomer = (organizationId: string, codcli: string, name: string) =>
    prisma.customer.create({
      data: { organizationId, codcli, name },
      select: { id: true, codcli: true, name: true },
    });

  const seedPurchase = (
    organizationId: string,
    data: {
      customerId: string;
      productId: string;
      invoiceNumber: string;
      purchaseDate: Date;
      quantity: number;
      value: string;
      status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
    },
  ) =>
    prisma.purchase.create({
      data: { organizationId, ...data },
      select: { id: true },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.audit.deleteMany({ where: { module: 'purchases' } });
    await prisma.purchase.deleteMany({
      where: {
        organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } },
      },
    });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
    });
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['purch-org-1', 'purch-org-2'] } },
    });

    const org1 = await prisma.organization.create({
      data: { name: 'Purch Org One', slug: 'purch-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Purch Org Two', slug: 'purch-org-2' },
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
          firstName: 'Purch',
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
      await seedCustomer(org1Id, 'PURC-0001', 'Juan Pérez'),
      await seedCustomer(org1Id, 'PURC-0002', 'María López'),
      await seedCustomer(org1Id, 'PURC-0003', 'Carlos Ruiz'),
    ];
    await seedCustomer(org2Id, 'PURC-0001', 'Cliente Ajeno');

    org1Products = [
      await seedProduct(org1Id, 'PROD-01', 'Laptop'),
      await seedProduct(org1Id, 'PROD-02', 'Teclado'),
    ];
    await seedProduct(org2Id, 'PROD-01', 'Monitor');

    org1Purchases = [
      await seedPurchase(org1Id, {
        customerId: org1Customers[0].id,
        productId: org1Products[0].id,
        invoiceNumber: 'INV-0001',
        purchaseDate: new Date('2026-01-15T10:00:00Z'),
        quantity: 1,
        value: '450.50',
        status: 'COMPLETED',
      }),
      await seedPurchase(org1Id, {
        customerId: org1Customers[1].id,
        productId: org1Products[1].id,
        invoiceNumber: 'INV-0002',
        purchaseDate: new Date('2026-02-15T10:00:00Z'),
        quantity: 2,
        value: '199.99',
        status: 'COMPLETED',
      }),
      await seedPurchase(org1Id, {
        customerId: org1Customers[2].id,
        productId: org1Products[0].id,
        invoiceNumber: 'INV-0003',
        purchaseDate: new Date('2026-03-15T10:00:00Z'),
        quantity: 1,
        value: '99.00',
        status: 'REFUNDED',
      }),
    ];
    await seedPurchase(org2Id, {
      customerId: (await prisma.customer.findFirst({
        where: { organizationId: org2Id },
        select: { id: true },
      }))!.id,
      productId: (await prisma.product.findFirst({
        where: { organizationId: org2Id },
        select: { id: true },
      }))!.id,
      invoiceNumber: 'INV-0001',
      purchaseDate: new Date('2026-04-15T10:00:00Z'),
      quantity: 1,
      value: '10.00',
      status: 'COMPLETED',
    });
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { module: 'purchases' } });
    await prisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
    });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
    });
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: ['purch-org-1', 'purch-org-2'] } } },
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

  it('lists only the organization purchases with pagination meta (AS-001)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/purchases?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: PurchaseRow[];
      meta: { page: number; limit: number; total: number; pages: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.data.map((p) => p.organizationId)).not.toContain(org2Id);
    expect(body.meta).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
  });

  it('returns customer and product summaries in list and detail (AS-001, AS-002)', async () => {
    const token = await login(emails.admin1);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const first = (list.body as { data: PurchaseRow[] }).data[0];
    expect(first.customer).toMatchObject({
      id: org1Customers[2].id,
      codcli: 'PURC-0003',
      name: 'Carlos Ruiz',
    });
    expect(first.product).toMatchObject({
      id: org1Products[0].id,
      code: 'PROD-01',
      name: 'Laptop',
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${org1Purchases[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const purchase = (detail.body as { data: PurchaseRow }).data;
    expect(purchase.invoiceNumber).toBe('INV-0001');
    expect(purchase.customer?.codcli).toBe('PURC-0001');
    expect(purchase.product?.code).toBe('PROD-01');
    expect(purchase.value).toBe('450.5');
  });

  it('applies search, status, customer, date range filters and sort (AS-003)', async () => {
    const token = await login(emails.admin1);

    const search = await request(app.getHttpServer())
      .get('/api/v1/purchases?search=inv-0002')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (search.body as { data: PurchaseRow[] }).data.map((p) => p.invoiceNumber),
    ).toEqual(['INV-0002']);

    const byStatus = await request(app.getHttpServer())
      .get('/api/v1/purchases?status=REFUNDED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byStatus.body as { data: PurchaseRow[] }).data.map(
        (p) => p.invoiceNumber,
      ),
    ).toEqual(['INV-0003']);

    const byCustomer = await request(app.getHttpServer())
      .get(`/api/v1/purchases?customerId=${org1Customers[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byCustomer.body as { data: PurchaseRow[] }).data.map(
        (p) => p.invoiceNumber,
      ),
    ).toEqual(['INV-0001']);

    const byDate = await request(app.getHttpServer())
      .get(
        '/api/v1/purchases?dateFrom=2026-02-01&dateTo=2026-02-28&sort=invoiceNumber',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (byDate.body as { data: PurchaseRow[] }).data.map((p) => p.invoiceNumber),
    ).toEqual(['INV-0002']);

    const newestFirst = await request(app.getHttpServer())
      .get('/api/v1/purchases?sort=-purchaseDate')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (newestFirst.body as { data: PurchaseRow[] }).data[0].invoiceNumber,
    ).toBe('INV-0003');
  });

  it('returns 404 for unknown purchase ids', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/purchases/purch-does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body).toMatchObject({
      error: { code: 'PURCHASE_NOT_FOUND' },
    });
  });

  it('creates a purchase with createdBy, string value and default status (AS-006)', async () => {
    const token = await login(emails.admin1);

    const created = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[1].id,
      invoiceNumber: 'INV-0100',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 2,
      value: '450.50',
    }).expect(201);

    const data = (created.body as { data: PurchaseRow }).data;
    expect(data.status).toBe('COMPLETED');
    expect(data.value).toBe('450.5');
    expect(data.quantity).toBe(2);
    expect(data.createdBy).toBeTruthy();
    expect(data.customer?.codcli).toBe('PURC-0001');
    expect(data.product?.code).toBe('PROD-02');
  });

  it('rejects duplicate invoice tuples with 409 (CP-005, AS-007)', async () => {
    const token = await login(emails.admin1);

    const dup = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[1].id,
      invoiceNumber: 'INV-0100',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '10.00',
    }).expect(409);

    expect(dup.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: 'A purchase with this invoiceNumber already exists',
      },
    });
  });

  it('rejects customerId or productId outside the organization (AS-004)', async () => {
    const token = await login(emails.admin1);

    const badCustomer = await createPurchase(token, {
      customerId: 'cust-no-existe',
      productId: org1Products[0].id,
      invoiceNumber: 'INV-0200',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '10.00',
    }).expect(400);
    expect(badCustomer.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });

    const badProduct = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: 'prod-no-existe',
      invoiceNumber: 'INV-0201',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '10.00',
    }).expect(400);
    expect(badProduct.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('rejects malformed value with 400 (HG-7, AS-008)', async () => {
    const token = await login(emails.admin1);

    const res = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-0300',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '450.505',
    }).expect(400);

    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it('accepts quantity at the Prisma Int maximum and rejects one above it (create and update)', async () => {
    const token = await login(emails.admin1);

    const created = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-QMAX-1',
      purchaseDate: '2026-09-01T10:00:00Z',
      quantity: 2147483647,
      value: '1.00',
    }).expect(201);
    expect((created.body as { data: PurchaseRow }).data.quantity).toBe(
      2147483647,
    );

    const overMax = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-QMAX-2',
      purchaseDate: '2026-09-02T10:00:00Z',
      quantity: 2147483648,
      value: '1.00',
    }).expect(400);
    expect(overMax.body).toMatchObject({ error: 'Bad Request' });
    expect((overMax.body as { message: string[] }).message).toContain(
      'quantity must not be greater than 2147483647',
    );

    const id = (created.body as { data: PurchaseRow }).data.id;
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2147483647 })
      .expect(200);
    expect((patched.body as { data: PurchaseRow }).data.quantity).toBe(
      2147483647,
    );

    const patchOverMax = await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2147483648 })
      .expect(400);
    expect(patchOverMax.body).toMatchObject({ error: 'Bad Request' });
    expect((patchOverMax.body as { message: string[] }).message).toContain(
      'quantity must not be greater than 2147483647',
    );
  });

  it('includes the whole requested day on a date-only dateTo and keeps dateFrom as a lower bound', async () => {
    const token = await login(emails.admin1);

    const boundary: Record<string, string> = {
      'INV-BD-1': '2026-02-28T00:00:00Z',
      'INV-BD-2': '2026-02-28T12:00:00Z',
      'INV-BD-3': '2026-02-28T23:59:59.999Z',
      'INV-BD-4': '2026-03-01T00:00:00Z',
    };
    for (const [invoiceNumber, purchaseDate] of Object.entries(boundary)) {
      await createPurchase(token, {
        customerId: org1Customers[0].id,
        productId: org1Products[0].id,
        invoiceNumber,
        purchaseDate,
        quantity: 1,
        value: '1.00',
      }).expect(201);
    }

    const to = await request(app.getHttpServer())
      .get('/api/v1/purchases?dateTo=2026-02-28')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const toInvoices = (to.body as { data: PurchaseRow[] }).data.map(
      (p) => p.invoiceNumber,
    );
    expect(toInvoices).toEqual(
      expect.arrayContaining(['INV-BD-1', 'INV-BD-2', 'INV-BD-3']),
    );
    expect(toInvoices).not.toContain('INV-BD-4');
    expect(toInvoices).not.toContain('INV-0003');

    const from = await request(app.getHttpServer())
      .get('/api/v1/purchases?dateFrom=2026-02-28')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const fromInvoices = (from.body as { data: PurchaseRow[] }).data.map(
      (p) => p.invoiceNumber,
    );
    expect(fromInvoices).toEqual(
      expect.arrayContaining(['INV-BD-1', 'INV-BD-2', 'INV-BD-3', 'INV-BD-4']),
    );
    expect(fromInvoices).not.toContain('INV-0002');

    const datetime = await request(app.getHttpServer())
      .get('/api/v1/purchases?dateTo=2026-02-28T12:00:00Z')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const datetimeInvoices = (
      datetime.body as { data: PurchaseRow[] }
    ).data.map((p) => p.invoiceNumber);
    expect(datetimeInvoices).toEqual(
      expect.arrayContaining(['INV-BD-1', 'INV-BD-2']),
    );
    expect(datetimeInvoices).not.toContain('INV-BD-3');
    expect(datetimeInvoices).not.toContain('INV-BD-4');
  });

  it('rejects organization users that send organizationId (AS-011)', async () => {
    const token = await login(emails.admin1);

    const res = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-0400',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '10.00',
      organizationId: org2Id,
    }).expect(400);

    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('updates status and quantity but never invoiceNumber (AS-012, AS-013)', async () => {
    const token = await login(emails.admin1);
    const id = org1Purchases[1].id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED', quantity: 3 })
      .expect(200);

    expect((updated.body as { data: PurchaseRow }).data.status).toBe(
      'CANCELLED',
    );
    expect((updated.body as { data: PurchaseRow }).data.quantity).toBe(3);

    const immutable = await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceNumber: 'INV-9999' })
      .expect(400);
    expect(immutable.body).toMatchObject({
      error: 'Bad Request',
      message: ['invoiceNumber is immutable and cannot be updated'],
    });

    const unknownField = await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: org1Customers[1].id })
      .expect(200);
    expect(
      (unknownField.body as { data: { customer: { codcli: string } } }).data
        .customer.codcli,
    ).toBe('PURC-0002');
  });

  it('enforces OPERADOR read-only on all writes (AS-009)', async () => {
    const token = await login(emails.operador1);
    const id = org1Purchases[0].id;

    await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const create = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-0500',
      purchaseDate: '2026-07-22T14:35:18Z',
      quantity: 1,
      value: '10.00',
    }).expect(403);
    expect(create.body).toMatchObject({ error: { code: 'FORBIDDEN' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' })
      .expect(403);
  });

  it('isolates tenants: org2 cannot read or update org1 purchases (AS-005)', async () => {
    const token = await login(emails.admin2);
    const id = org1Purchases[0].id;

    const get = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(get.body).toMatchObject({ error: { code: 'PURCHASE_NOT_FOUND' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/purchases/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED' })
      .expect(404);
  });

  it('lets PLATFORM_OWNER operate cross-org with a validated organizationId (AS-010)', async () => {
    const token = await login(emails.owner);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: PurchaseRow[] }).data.some(
        (p) =>
          p.invoiceNumber === 'INV-0001' && p.customer?.codcli === 'PURC-0001',
      ),
    ).toBe(true);

    const created = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-PLAT-1',
      purchaseDate: '2026-08-01T10:00:00Z',
      quantity: 1,
      value: '5.00',
      organizationId: org1Id,
    }).expect(201);
    expect((created.body as { data: PurchaseRow }).data.organizationId).toBe(
      org1Id,
    );

    const missing = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-PLAT-2',
      purchaseDate: '2026-08-01T10:00:00Z',
      quantity: 1,
      value: '5.00',
    }).expect(400);
    expect(missing.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const unknown = await createPurchase(token, {
      customerId: org1Customers[0].id,
      productId: org1Products[0].id,
      invoiceNumber: 'INV-PLAT-3',
      purchaseDate: '2026-08-01T10:00:00Z',
      quantity: 1,
      value: '5.00',
      organizationId: 'org-no-existe',
    }).expect(400);
    expect(unknown.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('has no DELETE route (HG-4)', async () => {
    const token = await login(emails.admin1);

    await request(app.getHttpServer())
      .delete(`/api/v1/purchases/${org1Purchases[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects unauthenticated requests with 401 (AS-016)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchases')
      .expect(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('records purchase write operations in the audit log (AS-017)', async () => {
    const rows = await prisma.audit.findMany({
      where: { module: 'purchases' },
    });

    expect(
      rows.some(
        (r) =>
          r.action === 'purchase.create.success' &&
          r.organizationId === org1Id &&
          r.userId !== null,
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'purchase.update.success' && r.organizationId === org1Id,
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === 'purchase.create.failure' &&
          (r.metadata as { reason?: string })?.reason === 'duplicate_purchase',
      ),
    ).toBe(true);
  });
});
