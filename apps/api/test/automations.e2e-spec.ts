import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';

interface AutomationRow {
  uuid: string;
  status: string;
  scheduledDate: string;
  priority: number;
}

interface CycleRow {
  uuid: string;
  status: string;
  startDate: string;
  endDate: string | null;
  purchaseId: string;
  automations?: AutomationRow[];
}

describe('Automations (e2e) — AU-001/AU-003 + US1..US8', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let events: EventEmitter2;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'auto-admin@org1.test',
    gerente1: 'auto-gerente@org1.test',
    operador1: 'auto-operador@org1.test',
    admin2: 'auto-admin2@org2.test',
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

  const createOrgSeed = async (slug: string, name: string) => {
    const org = await prisma.organization.create({
      data: { name, slug },
      select: { id: true },
    });
    await prisma.role.createMany({
      data: [
        { organizationId: org.id, name: 'ADMINISTRADOR' },
        { organizationId: org.id, name: 'GERENTE' },
        { organizationId: org.id, name: 'OPERADOR' },
      ],
    });
    return org.id;
  };

  let hash: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    events = app.get(EventEmitter2);
    hash = await bcrypt.hash(password, 12);

    await prisma.audit.deleteMany({ where: { module: 'automations' } });
    await prisma.message.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.automation.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.commercialCycle.deleteMany({
      where: {
        purchase: {
          organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } },
        },
      },
    });
    await prisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.customer.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.product.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.role.deleteMany({
      where: { organization: { slug: { in: ['auto-org-1', 'auto-org-2'] } } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ['auto-org-1', 'auto-org-2'] } },
    });

    org1Id = await createOrgSeed('auto-org-1', 'Auto Org One');
    org2Id = await createOrgSeed('auto-org-2', 'Auto Org Two');

    const roles1 = await prisma.role.findMany({
      where: { organizationId: org1Id },
    });
    const roleByName = new Map(roles1.map((r) => [r.name, r.id]));
    const roles2 = await prisma.role.findMany({
      where: { organizationId: org2Id },
    });
    const admin2Role = roles2.find((r) => r.name === 'ADMINISTRADOR');

    await prisma.user.create({
      data: {
        email: emails.admin1,
        passwordHash: hash,
        firstName: 'Auto',
        lastName: 'Admin1',
        accountType: 'ORGANIZATION',
        organizationId: org1Id,
        roleId: roleByName.get('ADMINISTRADOR') as string,
        status: 'ACTIVE',
      },
    });
    await prisma.user.create({
      data: {
        email: emails.gerente1,
        passwordHash: hash,
        firstName: 'Auto',
        lastName: 'Gerente1',
        accountType: 'ORGANIZATION',
        organizationId: org1Id,
        roleId: roleByName.get('GERENTE') as string,
        status: 'ACTIVE',
      },
    });
    await prisma.user.create({
      data: {
        email: emails.operador1,
        passwordHash: hash,
        firstName: 'Auto',
        lastName: 'Operador1',
        accountType: 'ORGANIZATION',
        organizationId: org1Id,
        roleId: roleByName.get('OPERADOR') as string,
        status: 'ACTIVE',
      },
    });
    await prisma.user.create({
      data: {
        email: emails.admin2,
        passwordHash: hash,
        firstName: 'Auto',
        lastName: 'Admin2',
        accountType: 'ORGANIZATION',
        organizationId: org2Id,
        roleId: admin2Role?.id ?? null,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await prisma.audit.deleteMany({ where: { module: 'automations' } });
    await prisma.message.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.automation.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await prisma.commercialCycle.deleteMany({
      where: { purchase: { organizationId: { in: [org1Id, org2Id] } } },
    });
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

  const seedPurchase = async (
    orgId: string,
    customerSuffix: string,
    invoice: string,
    purchaseDate: Date,
  ) => {
    const customer = await prisma.customer.upsert({
      where: {
        organizationId_codcli: {
          organizationId: orgId,
          codcli: `AUTO-${customerSuffix}`,
        },
      },
      create: {
        organizationId: orgId,
        codcli: `AUTO-${customerSuffix}`,
        name: `Cliente ${customerSuffix}`,
        status: 'ACTIVE',
      },
      update: {},
      select: { id: true },
    });
    const product = await prisma.product.upsert({
      where: {
        organizationId_code: {
          organizationId: orgId,
          code: `AUTO-PROD-${customerSuffix}`,
        },
      },
      create: {
        organizationId: orgId,
        code: `AUTO-PROD-${customerSuffix}`,
        name: `Producto ${customerSuffix}`,
        status: 'ACTIVE',
      },
      update: {},
      select: { id: true },
    });
    const purchase = await prisma.purchase.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        productId: product.id,
        invoiceNumber: invoice,
        purchaseDate,
        quantity: 1,
        value: 10,
        createdBy: 'seed',
      },
      select: { id: true, uuid: true },
    });
    return { customer, product, purchase };
  };

  const emitPurchaseImported = (purchaseId: string) =>
    events.emit('PurchaseImported', {
      eventId: 'test-event',
      occurredAt: new Date().toISOString(),
      userId: null,
      organizationId: 'any',
      module: 'imports',
      state: 'PROCESSING',
      payload: { importId: 'imp-1', purchaseId, invoiceNumber: 'F' },
    });

  const waitForCycle = async (purchaseId: string) => {
    for (let i = 0; i < 50; i++) {
      const cycle = await prisma.commercialCycle.findUnique({
        where: { purchaseId },
      });
      if (cycle) {
        return cycle;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`cycle not created for purchase ${purchaseId}`);
  };

  it('creates one ACTIVE cycle and three SCHEDULED automations on PurchaseImported (AU-001, AS-001)', async () => {
    const { purchase } = await seedPurchase(
      org1Id,
      '1',
      'AUTO-INV-1',
      new Date('2026-08-01T12:00:00Z'),
    );

    emitPurchaseImported(purchase.id);

    await waitForCycle(purchase.id);
    const cycleWithAutomations = await prisma.commercialCycle.findUnique({
      where: { purchaseId: purchase.id },
      include: { automations: true },
    });

    expect(cycleWithAutomations?.status).toBe('ACTIVE');
    expect(cycleWithAutomations?.automations).toHaveLength(3);
    expect(cycleWithAutomations?.automations.map((a) => a.status)).toEqual([
      'SCHEDULED',
      'SCHEDULED',
      'SCHEDULED',
    ]);
    const dates = cycleWithAutomations?.automations
      .map((a) => a.scheduledDate.toISOString())
      .sort();
    expect(dates).toEqual([
      new Date('2026-08-04T12:00:00Z').toISOString(), // +3 days
      new Date('2027-02-01T12:00:00Z').toISOString(), // +6 months
      new Date('2027-08-01T12:00:00Z').toISOString(), // +12 months
    ]);

    const token = await login(emails.admin1);
    const list = await request(app.getHttpServer())
      .get('/api/v1/commercial-cycles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (list.body as { data: CycleRow[] }).data.some(
        (c) => c.purchaseId === purchase.uuid && c.status === 'ACTIVE',
      ),
    ).toBe(true);
  });

  it('does not duplicate the cycle on a replayed event (idempotent, AS-002)', async () => {
    const { purchase } = await seedPurchase(
      org1Id,
      '2',
      'AUTO-INV-2',
      new Date('2026-07-01T12:00:00Z'),
    );

    emitPurchaseImported(purchase.id);
    emitPurchaseImported(purchase.id);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const count = await prisma.commercialCycle.count({
      where: { purchaseId: purchase.id },
    });
    expect(count).toBe(1);
  });

  it('cancels the previous ACTIVE cycle on a re-purchase and starts a new one (AU-003, AS-003)', async () => {
    const first = await seedPurchase(
      org1Id,
      '3',
      'AUTO-INV-3',
      new Date('2026-06-01T12:00:00Z'),
    );
    const second = await seedPurchase(
      org1Id,
      '3',
      'AUTO-INV-4',
      new Date('2026-08-10T12:00:00Z'),
    );

    const cancelledAutomationIds: string[] = [];
    events.on(
      'AutomationCancelled',
      (e: { payload: { automationId: string } }) => {
        cancelledAutomationIds.push(e.payload.automationId);
      },
    );

    emitPurchaseImported(first.purchase.id);
    await waitForCycle(first.purchase.id);
    emitPurchaseImported(second.purchase.id);
    await waitForCycle(second.purchase.id);

    const firstCycle = await prisma.commercialCycle.findUnique({
      where: { purchaseId: first.purchase.id },
      include: { automations: true },
    });
    const secondCycle = await prisma.commercialCycle.findUnique({
      where: { purchaseId: second.purchase.id },
    });

    expect(firstCycle?.status).toBe('CANCELLED');
    expect(firstCycle?.endDate).toBeTruthy();
    expect(firstCycle?.automations.every((a) => a.status === 'CANCELLED')).toBe(
      true,
    );
    expect(secondCycle?.status).toBe('ACTIVE');
    for (let i = 0; i < 50 && cancelledAutomationIds.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(cancelledAutomationIds.sort()).toEqual(
      firstCycle?.automations.map((a) => a.uuid).sort(),
    );
  });

  it('lists cycles with filters and returns cycle detail with automations (AS-004, AS-005)', async () => {
    const token = await login(emails.admin1);

    const filtered = await request(app.getHttpServer())
      .get('/api/v1/commercial-cycles?status=ACTIVE&page=1&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const cycles = (filtered.body as { data: CycleRow[] }).data;
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles.every((c) => c.status === 'ACTIVE')).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/commercial-cycles/${cycles[0].uuid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = detail.body as { data: CycleRow };
    expect(body.data.automations?.length).toBe(3);

    const automations = await request(app.getHttpServer())
      .get('/api/v1/automations?status=SCHEDULED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (automations.body as { data: AutomationRow[] }).data.length,
    ).toBeGreaterThan(0);
  });

  it('returns automation detail with purchase and customer summaries', async () => {
    const token = await login(emails.admin1);

    const list = await request(app.getHttpServer())
      .get('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const automations = (list.body as { data: AutomationRow[] }).data;
    expect(automations.length).toBeGreaterThan(0);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/automations/${automations[0].uuid}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = detail.body as {
      data: { customer: unknown; purchase: { productName: string } };
    };
    expect(data.data.customer).toBeDefined();
    expect(data.data.purchase).toBeDefined();
    expect(data.data.purchase.productName).toBeTruthy();
  });

  it('cancels a SCHEDULED automation and rejects cancelling an EXECUTED one (AS-006, AS-007)', async () => {
    const token = await login(emails.gerente1);

    const list = await request(app.getHttpServer())
      .get('/api/v1/automations?status=SCHEDULED')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (list.body as { data: AutomationRow[] }).data[0];

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/automations/${target.uuid}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cancelled.body).toMatchObject({
      data: { status: 'CANCELLED', success: true },
    });

    const again = await request(app.getHttpServer())
      .post(`/api/v1/automations/${target.uuid}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(again.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('isolates tenants: org2 cannot read org1 cycles/automations (AS-008)', async () => {
    const token = await login(emails.admin1);
    const org2Token = await login(emails.admin2);

    const list = await request(app.getHttpServer())
      .get('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (list.body as { data: AutomationRow[] }).data[0];

    await request(app.getHttpServer())
      .get(`/api/v1/automations/${target.uuid}`)
      .set('Authorization', `Bearer ${org2Token}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/automations/${target.uuid}/cancel`)
      .set('Authorization', `Bearer ${org2Token}`)
      .expect(404);
  });

  it('enforces OPERADOR read-only on cancel (AS-009)', async () => {
    const token = await login(emails.admin1);
    const operadorToken = await login(emails.operador1);

    const list = await request(app.getHttpServer())
      .get('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const target = (list.body as { data: AutomationRow[] }).data[0];

    await request(app.getHttpServer())
      .get('/api/v1/automations')
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/automations/${target.uuid}/cancel`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(403);
    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('has no manual create endpoint (FR-014, AS-010)', async () => {
    const token = await login(emails.admin1);

    await request(app.getHttpServer())
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/commercial-cycles')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('records automation actions in the audit log and emits domain events (AS-011, AS-012)', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rows = await prisma.audit.findMany({
      where: { module: 'automations' },
    });

    expect(
      rows.some((r) => r.action === 'automation.cycle.created.success'),
    ).toBe(true);
    expect(rows.some((r) => r.action === 'automation.created.success')).toBe(
      true,
    );
    expect(rows.some((r) => r.action === 'automation.cancelled.success')).toBe(
      true,
    );
    expect(
      rows.some((r) => r.action === 'automation.cycle.cancelled.success'),
    ).toBe(true);
  });
});
