process.env.NODE_ENV = 'test';
process.env.WHATSAPP_API_TOKEN = 'e2e-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'e2e-phone';
process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'e2e-verify';
process.env.WHATSAPP_WEBHOOK_SECRET = 'e2e-secret';
process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID = 'e2e-org';

import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';
import { WhatsappService } from './../src/modules/whatsapp/whatsapp.service';
import { WHATSAPP_PROVIDER } from './../src/modules/whatsapp/whatsapp.provider';

describe('WhatsApp/Messaging (e2e) — Flujo 05/06/07, US1..US8, AU-005/AU-011', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let events: EventEmitter2;
  let whatsapp: WhatsappService;
  let providerSend: jest.Mock;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'whats-admin@org1.test',
    operador1: 'whats-operador@org1.test',
    admin2: 'whats-admin2@org2.test',
  };
  let org1Id: string;
  let org2Id: string;
  let customer1Id: string;
  let customer1Uuid: string;
  let providerSeq = 0;
  let seedPrisma: PrismaService;

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200)
      .then(
        (res) =>
          (res.body as { data: { accessToken: string } }).data.accessToken,
      );

  const createOrgSeed = async (
    client: PrismaService,
    slug: string,
    name: string,
  ) => {
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

  let hash: string;

  beforeAll(async () => {
    seedPrisma = new PrismaService();
    await seedPrisma.$connect();

    await seedPrisma.audit.deleteMany({ where: { module: 'whatsapp' } });
    await seedPrisma.message.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.conversation.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.automation.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.commercialCycle.deleteMany({
      where: {
        purchase: {
          organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } },
        },
      },
    });
    await seedPrisma.purchase.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.product.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await seedPrisma.role.deleteMany({
      where: { organization: { slug: { in: ['whats-org-1', 'whats-org-2'] } } },
    });
    await seedPrisma.organization.deleteMany({
      where: { slug: { in: ['whats-org-1', 'whats-org-2'] } },
    });

    org1Id = await createOrgSeed(seedPrisma, 'whats-org-1', 'Whats Org One');
    org2Id = await createOrgSeed(seedPrisma, 'whats-org-2', 'Whats Org Two');
    process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID = org1Id;

    providerSend = jest.fn().mockImplementation(() => {
      providerSeq += 1;
      return {
        providerMessageId: `wamid-e2e-${providerSeq}`,
        providerConversationId: '573000000001',
        status: 'SENT',
      };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WHATSAPP_PROVIDER)
      .useValue({ sendMessage: providerSend })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    events = app.get(EventEmitter2);
    whatsapp = app.get(WhatsappService);
    hash = await bcrypt.hash(password, 12);

    const roles1 = await prisma.role.findMany({
      where: { organizationId: org1Id },
    });
    const roleByName = new Map(roles1.map((r) => [r.name, r.id]));
    const roles2 = await prisma.role.findMany({
      where: { organizationId: org2Id },
    });
    const admin2Role = roles2.find((r) => r.name === 'ADMINISTRADOR');

    await prisma.user.createMany({
      data: [
        {
          email: emails.admin1,
          passwordHash: hash,
          firstName: 'Whats',
          lastName: 'Admin1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: roleByName.get('ADMINISTRADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.operador1,
          passwordHash: hash,
          firstName: 'Whats',
          lastName: 'Operador1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: roleByName.get('OPERADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.admin2,
          passwordHash: hash,
          firstName: 'Whats',
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
        code: 'WHATS-P1',
        name: 'Lavadora',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await prisma.product.create({
      data: {
        organizationId: org2Id,
        code: 'WHATS-P2',
        name: 'Nevera',
        status: 'ACTIVE',
      },
    });

    const customer1 = await prisma.customer.create({
      data: {
        organizationId: org1Id,
        codcli: 'WHATS-C1',
        name: 'Juan Perez',
        phone: '573000000001',
        status: 'ACTIVE',
      },
      select: { id: true, uuid: true },
    });
    const customer2 = await prisma.customer.create({
      data: {
        organizationId: org1Id,
        codcli: 'WHATS-C2',
        name: 'Maria Lopez',
        phone: null,
        status: 'ACTIVE',
      },
      select: { id: true, uuid: true },
    });
    await prisma.customer.create({
      data: {
        organizationId: org2Id,
        codcli: 'WHATS-C3',
        name: 'Other Org',
        phone: '579999999999',
        status: 'ACTIVE',
      },
    });
    customer1Id = customer1.id;
    customer1Uuid = customer1.uuid;

    const purchase1 = await prisma.purchase.create({
      data: {
        organizationId: org1Id,
        customerId: customer1.id,
        productId: product1.id,
        invoiceNumber: 'WHATS-INV-1',
        purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: 1,
        value: 1000000,
      },
      select: { id: true },
    });

    await prisma.commercialCycle.create({
      data: {
        purchaseId: purchase1.id,
        status: 'ACTIVE',
        startDate: new Date('2026-08-01T12:00:00.000Z'),
      },
    });

    await prisma.automation.create({
      data: {
        organizationId: org1Id,
        purchaseId: purchase1.id,
        scheduledDate: new Date('2026-08-04T12:00:00.000Z'),
        status: 'SCHEDULED',
        priority: 0,
      },
    });

    const purchaseInactive = await prisma.purchase.create({
      data: {
        organizationId: org1Id,
        customerId: customer2.id,
        productId: product1.id,
        invoiceNumber: 'WHATS-INV-2',
        purchaseDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: 1,
        value: 500000,
      },
      select: { id: true },
    });
    await prisma.commercialCycle.create({
      data: {
        purchaseId: purchaseInactive.id,
        status: 'ACTIVE',
        startDate: new Date('2026-08-01T12:00:00.000Z'),
      },
    });
    await prisma.automation.create({
      data: {
        organizationId: org1Id,
        purchaseId: purchaseInactive.id,
        scheduledDate: new Date('2026-08-04T12:00:00.000Z'),
        status: 'SCHEDULED',
        priority: 0,
      },
    });
  });

  afterAll(async () => {
    await seedPrisma.audit.deleteMany({ where: { module: 'whatsapp' } });
    await seedPrisma.message.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.conversation.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.automation.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.commercialCycle.deleteMany({
      where: { purchase: { organizationId: { in: [org1Id, org2Id] } } },
    });
    await seedPrisma.purchase.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.product.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await seedPrisma.role.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.organization.deleteMany({
      where: { id: { in: [org1Id, org2Id] } },
    });
    await app.close();
    await seedPrisma.$disconnect();
  });

  it('AS-001 — executes due SCHEDULED automations: OUTBOUND message, EXECUTED, events', async () => {
    const collected = collectEvents();

    await whatsapp.executeDueAutomations();
    await delay(100);

    const messages = await prisma.message.findMany({
      where: { organizationId: org1Id, type: 'AUTOMATIC' },
    });
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.status)).toContain('SENT');
    expect(messages.map((m) => m.status)).toContain('FAILED');
    expect(messages.every((m) => m.direction === 'OUTBOUND')).toBe(true);

    const executed = await prisma.automation.findMany({
      where: { organizationId: org1Id, status: 'EXECUTED' },
    });
    expect(executed).toHaveLength(2);

    expect(collected).toContain('MessageQueued');
    expect(collected).toContain('MessageSent');
    expect(collected).toContain('AutomationExecuted');
    expect(collected).toContain('AutomationFailed');
  });

  it('AS-002 — AU-011: re-running never sends a second message', async () => {
    await whatsapp.executeDueAutomations();

    const messages = await prisma.message.findMany({
      where: { organizationId: org1Id, type: 'AUTOMATIC' },
    });
    expect(messages).toHaveLength(2);
  });

  it('AS-003 — customer without phone: message FAILED with customer_no_phone, automation EXECUTED', async () => {
    const failed = await prisma.message.findMany({
      where: { organizationId: org1Id, status: 'FAILED', type: 'AUTOMATIC' },
    });
    expect(failed).toHaveLength(1);
    expect(failed[0].automationId).not.toBeNull();
  });

  it('AS-004/005 — manual send by ADMINISTRADOR and OPERADOR (HG-11)', async () => {
    const adminToken = await login(emails.admin1);
    const operadorToken = await login(emails.operador1);

    const resAdmin = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'idem-admin-1')
      .send({ customerId: customer1Uuid, content: 'Hola manual admin' })
      .expect(201);
    expect(resAdmin.status).toBe(201);

    const adminBody = resAdmin.body as {
      data: { direction: string; type: string };
    };
    expect(adminBody.data).toMatchObject({
      direction: 'OUTBOUND',
      type: 'MANUAL',
    });

    const resOperador = await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ customerId: customer1Uuid, content: 'Hola manual operador' })
      .expect(201);

    const operadorBody = resOperador.body as { data: { type: string } };
    expect(operadorBody.data.type).toBe('MANUAL');
  });

  it('AS-006 — inbound webhook opens a conversation and records the INBOUND message', async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.inbound.1',
                    from: '573000000001',
                    text: { body: 'Hola, quiero info de mi compra' },
                    timestamp: '1755000000',
                    conversation: { id: 'conv-in-1' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const signature = `sha256=${createHmac('sha256', 'e2e-secret')
      .update(Buffer.from(JSON.stringify(payload)))
      .digest('hex')}`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', signature)
      .send(payload)
      .expect(200);

    expect(res.body).toEqual({ data: { status: 'received' } });

    const conversation = await prisma.conversation.findFirst({
      where: {
        organizationId: org1Id,
        customerId: customer1Id,
        status: 'OPEN',
      },
    });
    expect(conversation).not.toBeNull();
    const inbound = await prisma.message.findFirst({
      where: { organizationId: org1Id, direction: 'INBOUND' },
    });
    expect(inbound).toMatchObject({
      direction: 'INBOUND',
      type: 'INCOMING',
      providerMessageId: 'wamid.inbound.1',
    });
  });

  it('AS-007 — inbound from an unknown number creates a conversation with customerId null (HG-8)', async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.inbound.unknown',
                    from: '579111111111',
                    text: { body: 'Quien es?' },
                    timestamp: '1755000001',
                    conversation: { id: 'conv-in-2' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const signature = `sha256=${createHmac('sha256', 'e2e-secret')
      .update(Buffer.from(JSON.stringify(payload)))
      .digest('hex')}`;

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', signature)
      .send(payload)
      .expect(200);

    const pending = await prisma.conversation.findFirst({
      where: { organizationId: org1Id, customerId: null, status: 'OPEN' },
    });
    expect(pending).not.toBeNull();
  });

  it('AS-008 — a replayed inbound webhook is a no-op (HG-13)', async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.inbound.1',
                    from: '573000000001',
                    text: { body: 'Hola, quiero info de mi compra' },
                    timestamp: '1755000000',
                    conversation: { id: 'conv-in-1' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const signature = `sha256=${createHmac('sha256', 'e2e-secret')
      .update(Buffer.from(JSON.stringify(payload)))
      .digest('hex')}`;

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', signature)
      .send(payload)
      .expect(200);

    const inboundCount = await prisma.message.count({
      where: { organizationId: org1Id, providerMessageId: 'wamid.inbound.1' },
    });
    expect(inboundCount).toBe(1);
  });

  it('AS-009 — conversation detail returns the message history in one query', async () => {
    const adminToken = await login(emails.admin1);
    const conversation = await prisma.conversation.findFirst({
      where: { organizationId: org1Id, customerId: customer1Id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversation?.uuid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const detailBody = res.body as {
      data: { uuid: string; messages: unknown[] };
    };
    expect(detailBody.data.uuid).toBe(conversation?.uuid);
    expect(Array.isArray(detailBody.data.messages)).toBe(true);
  });

  it('AS-010 — list conversations and messages with filters + pagination', async () => {
    const adminToken = await login(emails.admin1);

    const convRes = await request(app.getHttpServer())
      .get('/api/v1/conversations?status=OPEN&limit=10&page=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const convBody = convRes.body as {
      data: unknown[];
      meta: { page: number; limit: number };
    };
    expect(convBody.data.length).toBeGreaterThan(0);
    expect(convBody.meta).toMatchObject({ page: 1, limit: 10 });

    const msgRes = await request(app.getHttpServer())
      .get('/api/v1/messages?direction=INBOUND&limit=10&page=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const msgBody = msgRes.body as { data: unknown[] };
    expect(msgBody.data.length).toBeGreaterThan(0);
  });

  it('AS-011 — cross-tenant conversation access returns 404', async () => {
    const admin2Token = await login(emails.admin2);
    const conversation = await prisma.conversation.findFirst({
      where: { organizationId: org1Id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversation?.uuid}`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .expect(404);

    const errBody = res.body as { error: { code: string } };
    expect(errBody.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('AS-013 — audit rows exist for the whatsapp module', async () => {
    const audits = await prisma.audit.findMany({
      where: { module: 'whatsapp', organizationId: org1Id },
      select: { action: true },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('message.send.success');
    expect(actions).toContain('message.received.success');
    expect(actions).toContain('conversation.opened.success');
    expect(actions).toContain('automation.executed.success');
    expect(actions).toContain('automation.failed.failure');
  });

  const EVENT_NAMES = [
    'MessageQueued',
    'MessageSent',
    'MessageDelivered',
    'MessageRead',
    'MessageReceived',
    'MessageFailed',
    'ConversationOpened',
    'AutomationExecuted',
    'AutomationFailed',
  ];

  function collectEvents(): string[] {
    const collected: string[] = [];
    EVENT_NAMES.forEach((name) => events.on(name, () => collected.push(name)));
    return collected;
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
});
