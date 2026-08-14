import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

interface ImportJobRow {
  uuid: string;
  type: string;
  status: string;
  fileName: string;
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  errorsSummary: { total: number; samples: unknown[] };
  createdAt: string;
}

describe('Imports (e2e) — US1..US12', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'imp-admin@org1.test',
    gerente1: 'imp-gerente@org1.test',
    operador1: 'imp-operador@org1.test',
    admin2: 'imp-admin2@org2.test',
    owner: 'imp-owner@platform.test',
  };
  let org1Id: string;
  let org2Id: string;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const upload = (
    token: string,
    fileName: string,
    buffer: Buffer,
    type: string,
    idempotencyKey?: string,
  ) => {
    let req = request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${token}`)
      .field('type', type)
      .attach('file', buffer, fileName);
    if (idempotencyKey) {
      req = req.set('Idempotency-Key', idempotencyKey);
    }
    return req;
  };

  const waitForStatus = async (
    uuid: string,
    token: string,
    timeoutMs = 20000,
  ) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/imports/${uuid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const status = (res.body as { data: ImportJobRow }).data.status;
      if (
        status !== 'PENDING' &&
        status !== 'VALIDATING' &&
        status !== 'PROCESSING'
      ) {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('import did not finish in time');
  };

  const customersCsv = Buffer.from(
    'codcli,name,phone\nC1,Juan,099\nC2,Ana,098\n',
  );
  const purchasesCsv = Buffer.from(
    'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,C1,P1,2026-08-01,2,150.50\n',
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.import.deleteMany({
      where: { organization: { slug: { in: ['imp-org-1', 'imp-org-2'] } } },
    });
    await prisma.audit.deleteMany({ where: { module: 'imports' } });
    await prisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['imp-org-1', 'imp-org-2'] } } },
    });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['imp-org-1', 'imp-org-2'] } } },
    });
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: ['imp-org-1', 'imp-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organization: { slug: { in: ['imp-org-1', 'imp-org-2'] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['imp-org-1', 'imp-org-2'] } },
    });

    const org1 = await prisma.organization.create({
      data: { name: 'Imp Org One', slug: 'imp-org-1' },
      select: { id: true },
    });
    org1Id = org1.id;
    const org2 = await prisma.organization.create({
      data: { name: 'Imp Org Two', slug: 'imp-org-2' },
      select: { id: true },
    });
    org2Id = org2.id;

    await prisma.role.createMany({
      data: [
        { organizationId: org1Id, name: 'ADMINISTRADOR' },
        { organizationId: org1Id, name: 'GERENTE' },
        { organizationId: org1Id, name: 'OPERADOR' },
      ],
    });
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
          firstName: 'Imp',
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

    await prisma.customer.create({
      data: { organizationId: org1Id, codcli: 'C1', name: 'Juan' },
    });
    await prisma.product.create({
      data: { organizationId: org1Id, code: 'P1', name: 'Producto 1' },
    });
  });

  afterAll(async () => {
    await prisma.import.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.audit.deleteMany({ where: { module: 'imports' } });
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

  it('imports customers asynchronously and completes (AS-001)', async () => {
    const token = await login(emails.admin1);

    const created = await upload(
      token,
      'clientes.csv',
      customersCsv,
      'CUSTOMERS',
    ).expect(201);
    const job = (created.body as { data: ImportJobRow }).data;
    expect(job.status).toBe('PENDING');
    expect(job.fileName).toBe('clientes.csv');
    expect(job).not.toHaveProperty('filePath');

    const done = await waitForStatus(job.uuid, token);
    const final = (done.body as { data: ImportJobRow }).data;
    expect(final.status).toBe('COMPLETED');
    expect(final.totalRecords).toBe(2);
    expect(final.processedRecords).toBe(2);
    expect(final.errorRecords).toBe(0);

    const customer = await prisma.customer.findFirst({
      where: { organizationId: org1Id, codcli: 'C2' },
    });
    expect(customer).not.toBeNull();
    expect(customer?.phone).toBe('098');
  });

  it('replays the same job on Idempotency-Key repeat (AS-006)', async () => {
    const token = await login(emails.admin1);

    const first = await upload(
      token,
      'rep.csv',
      Buffer.from('codcli,name\nC9,Rebe\n'),
      'CUSTOMERS',
      'imp-key-1',
    ).expect(201);
    const firstJob = (first.body as { data: ImportJobRow }).data;

    const second = await upload(
      token,
      'rep.csv',
      Buffer.from('codcli,name\nC9,Rebe\n'),
      'CUSTOMERS',
      'imp-key-1',
    ).expect(200);
    const secondJob = (second.body as { data: ImportJobRow }).data;
    expect(secondJob.uuid).toBe(firstJob.uuid);
  });

  it('rejects a duplicate file with 409 (AS-005, IM-005)', async () => {
    const token = await login(emails.admin1);
    const res = await upload(token, 'clientes.csv', customersCsv, 'CUSTOMERS');
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'DUPLICATE_FILE',
    );
  });

  it('rejects a second active job of the same type with 409 (AS-017, HG-16)', async () => {
    const token = await login(emails.admin1);
    await prisma.import.create({
      data: {
        organizationId: org1Id,
        userId: (await prisma.user.findUnique({
          where: { email: emails.admin1 },
          select: { id: true },
        }))!.id,
        type: 'CUSTOMERS',
        fileName: 'active.csv',
        filePath: 'uploads/org-org-1/active.csv',
        status: 'PROCESSING',
      },
    });

    const res = await upload(
      token,
      'nuevo.csv',
      Buffer.from('codcli,name\nCX1,Nuevo\n'),
      'CUSTOMERS',
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'IMPORT_ACTIVE',
    );

    await prisma.import.deleteMany({
      where: { organizationId: org1Id, fileName: 'active.csv' },
    });
  });

  it('imports purchases skipping CP-005 duplicates (AS-003)', async () => {
    const token = await login(emails.admin1);

    const first = await upload(
      token,
      'compras.csv',
      purchasesCsv,
      'PURCHASES',
    ).expect(201);
    const firstFinal = await waitForStatus(
      (first.body as { data: ImportJobRow }).data.uuid,
      token,
    );
    expect((firstFinal.body as { data: ImportJobRow }).data.status).toBe(
      'COMPLETED',
    );

    const purchases = await prisma.purchase.findMany({
      where: { organizationId: org1Id, invoiceNumber: 'F-1' },
    });
    expect(purchases).toHaveLength(1);

    const second = await upload(
      token,
      'compras2.csv',
      Buffer.from(
        'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-1,C1,P1,2026-08-01,3,150.50\n',
      ),
      'PURCHASES',
    ).expect(201);
    const secondFinal = await waitForStatus(
      (second.body as { data: ImportJobRow }).data.uuid,
      token,
    );
    expect((secondFinal.body as { data: ImportJobRow }).data.status).toBe(
      'COMPLETED',
    );
    const purchasesAfter = await prisma.purchase.findMany({
      where: { organizationId: org1Id, invoiceNumber: 'F-1' },
    });
    expect(purchasesAfter).toHaveLength(1);
  });

  it('records row errors and finishes PARTIAL (AS-008, AS-009)', async () => {
    const token = await login(emails.admin1);
    const csv = Buffer.from(
      'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-2,C1,P1,2026-08-02,1,10.00\nF-3,MISSING,P1,2026-08-03,1,10.00\n',
    );

    const created = await upload(token, 'parcial.csv', csv, 'PURCHASES').expect(
      201,
    );
    const done = await waitForStatus(
      (created.body as { data: ImportJobRow }).data.uuid,
      token,
    );
    const final = (done.body as { data: ImportJobRow }).data;
    expect(final.status).toBe('PARTIAL');
    expect(final.processedRecords).toBe(1);
    expect(final.errorRecords).toBe(1);
    expect(final.errorsSummary.total).toBe(1);
    expect(final.errorsSummary.samples).toHaveLength(1);
  });

  it('cancels an active job and rejects cancel of a final job (AS-011)', async () => {
    const token = await login(emails.admin1);
    const seeded = await prisma.import.create({
      data: {
        organizationId: org1Id,
        userId: (await prisma.user.findUnique({
          where: { email: emails.admin1 },
          select: { id: true },
        }))!.id,
        type: 'CUSTOMERS',
        fileName: 'cancel-active.csv',
        filePath: 'uploads/org-org-1/cancel-active.csv',
        status: 'PROCESSING',
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/imports/${seeded.uuid}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/imports/${seeded.uuid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((detail.body as { data: ImportJobRow }).data.status).toBe(
      'CANCELLED',
    );

    await request(app.getHttpServer())
      .post(`/api/v1/imports/${seeded.uuid}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('retries a PARTIAL job reprocessing only error rows (AS-012, HG-15)', async () => {
    const token = await login(emails.admin1);
    const csv = Buffer.from(
      'invoiceNumber,codcli,code,purchaseDate,quantity,value\nF-4,C1,P1,2026-08-04,1,10.00\nF-5,C1,MISSING,2026-08-05,1,10.00\n',
    );

    const created = await upload(token, 'retry.csv', csv, 'PURCHASES').expect(
      201,
    );
    const partial = await waitForStatus(
      (created.body as { data: ImportJobRow }).data.uuid,
      token,
    );
    expect((partial.body as { data: ImportJobRow }).data.status).toBe(
      'PARTIAL',
    );

    await prisma.product.create({
      data: { organizationId: org1Id, code: 'MISSING', name: 'Nuevo' },
    });

    const retry = await request(app.getHttpServer())
      .post(
        `/api/v1/imports/${(created.body as { data: ImportJobRow }).data.uuid}/retry`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((retry.body as { data: { status: string } }).data.status).toBe(
      'PROCESSING',
    );

    const done = await waitForStatus(
      (created.body as { data: ImportJobRow }).data.uuid,
      token,
    );
    const final = (done.body as { data: ImportJobRow }).data;
    expect(final.status).toBe('COMPLETED');
    expect(final.errorsSummary.total).toBe(0);
    const purchases = await prisma.purchase.findMany({
      where: { organizationId: org1Id, invoiceNumber: { in: ['F-4', 'F-5'] } },
    });
    expect(purchases).toHaveLength(2);
  });

  it('enforces tenant isolation with 404 (AS-014, HG-12)', async () => {
    const token = await login(emails.admin1);
    const created = await upload(
      token,
      't.csv',
      Buffer.from('codcli,name\nC5,Tenant\n'),
      'CUSTOMERS',
    ).expect(201);
    const job = (created.body as { data: ImportJobRow }).data;
    await waitForStatus(job.uuid, token);

    const otherToken = await login(emails.admin2);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/imports/${job.uuid}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'IMPORT_NOT_FOUND',
    );
  });

  it('enforces roles: OPERADOR cannot write but can read (AS-016, HG-11)', async () => {
    const operadorToken = await login(emails.operador1);

    const denied = await upload(
      operadorToken,
      'op.csv',
      customersCsv,
      'CUSTOMERS',
    );
    expect(denied.status).toBe(403);

    const list = await request(app.getHttpServer())
      .get('/api/v1/imports?limit=5')
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((list.body as { data: ImportJobRow[] }).data).toBeInstanceOf(Array);
  });

  it('rejects unsupported formats and oversized files (AS-018)', async () => {
    const token = await login(emails.admin1);

    const unsupported = await upload(
      token,
      'datos.txt',
      Buffer.from('codcli,name\nC1,Juan\n'),
      'CUSTOMERS',
    );
    expect(unsupported.status).toBe(415);

    const oversized = await upload(
      token,
      'grande.csv',
      Buffer.alloc(25 * 1024 * 1024 + 1, 97),
      'CUSTOMERS',
    );
    expect(oversized.status).toBe(413);
  });

  it('handles PLATFORM_OWNER organizationId rules (AS-015)', async () => {
    const ownerToken = await login(emails.owner);

    const missing = await upload(
      ownerToken,
      'po.csv',
      customersCsv,
      'CUSTOMERS',
    );
    expect(missing.status).toBe(400);

    const withOrg = await upload(
      ownerToken,
      'po.csv',
      customersCsv,
      'CUSTOMERS',
    );
    expect(withOrg.status).toBe(400);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('type', 'CUSTOMERS')
      .field('organizationId', org1Id)
      .attach('file', Buffer.from('codcli,name\nC7,Owner\n'), 'owner.csv');
    expect(ok.status).toBe(201);
    await waitForStatus(
      (ok.body as { data: ImportJobRow }).data.uuid,
      ownerToken,
    );

    const orgUser = await request(app.getHttpServer())
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${await login(emails.admin1)}`)
      .field('type', 'CUSTOMERS')
      .field('organizationId', org1Id)
      .attach('file', Buffer.from('codcli,name\nC8,X\n'), 'x.csv');
    expect(orgUser.status).toBe(400);
  });

  it('applies list filters and pagination (US6, AS-013)', async () => {
    const token = await login(emails.admin1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/imports?type=CUSTOMERS&status=COMPLETED&limit=2&page=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: ImportJobRow[];
      meta: { total: number; pages: number; page: number; limit: number };
    };
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.page).toBe(1);
    expect(body.data.every((job) => job.type === 'CUSTOMERS')).toBe(true);
  });

  it('audits import actions (AS-019, AD-003)', async () => {
    const audits = await prisma.audit.findMany({
      where: { module: 'imports' },
      select: { action: true },
    });
    const actions = new Set(audits.map((a) => a.action));
    expect(actions.has('import.create.success')).toBe(true);
    expect(actions.has('import.complete.success')).toBe(true);
  });
});
