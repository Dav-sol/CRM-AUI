process.env.NODE_ENV = 'test';
process.env.WHATSAPP_API_TOKEN = 'e2e-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'e2e-phone';
process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'e2e-verify';
process.env.WHATSAPP_WEBHOOK_SECRET = 'e2e-secret';
process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID = 'e2e-org';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';
import { WHATSAPP_PROVIDER } from './../src/modules/whatsapp/whatsapp.provider';

describe('Conversations Inbox (e2e) — Flujo 07, US1..US10, HG-1..HG-8', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let events: EventEmitter2;
  let providerSend: jest.Mock;
  let providerSeq = 0;

  const password = 'ValidPass123';
  const emails = {
    admin1: 'conv-admin@org1.test',
    gerente1: 'conv-gerente@org1.test',
    operador1: 'conv-operador@org1.test',
    admin2: 'conv-admin2@org2.test',
  };
  let org1Id: string;
  let org2Id: string;
  let advisor1Uuid: string;
  let advisor2Uuid: string;
  let conversationUuid: string;
  let closedConversationUuid: string;
  let archivedConversationUuid: string;
  let org2ConversationUuid: string;
  let tag1Uuid: string;
  let tag2Uuid: string;
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

  beforeAll(async () => {
    seedPrisma = new PrismaService();
    await seedPrisma.$connect();

    await seedPrisma.audit.deleteMany({ where: { module: 'conversations' } });
    await seedPrisma.conversationNote.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.conversationTagAssignment.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.conversationTag.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.quickReply.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.message.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.conversation.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await seedPrisma.role.deleteMany({
      where: { organization: { slug: { in: ['conv-org-1', 'conv-org-2'] } } },
    });
    await seedPrisma.organization.deleteMany({
      where: { slug: { in: ['conv-org-1', 'conv-org-2'] } },
    });

    org1Id = await createOrgSeed(seedPrisma, 'conv-org-1', 'Conv Org One');
    org2Id = await createOrgSeed(seedPrisma, 'conv-org-2', 'Conv Org Two');

    providerSend = jest.fn().mockImplementation(() => {
      providerSeq += 1;
      return {
        providerMessageId: `wamid-conv-${providerSeq}`,
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
    const hash = await bcrypt.hash(password, 12);

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
          firstName: 'Conv',
          lastName: 'Admin1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('ADMINISTRADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.gerente1,
          passwordHash: hash,
          firstName: 'Conv',
          lastName: 'Gerente1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('GERENTE') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.operador1,
          passwordHash: hash,
          firstName: 'Conv',
          lastName: 'Operador1',
          accountType: 'ORGANIZATION',
          organizationId: org1Id,
          roleId: role1ByName.get('OPERADOR') as string,
          status: 'ACTIVE',
        },
        {
          email: emails.admin2,
          passwordHash: hash,
          firstName: 'Conv',
          lastName: 'Admin2',
          accountType: 'ORGANIZATION',
          organizationId: org2Id,
          roleId: admin2Role?.id ?? null,
          status: 'ACTIVE',
        },
      ],
    });

    const operador1 = await prisma.user.findUniqueOrThrow({
      where: { email: emails.operador1 },
    });
    const gerente1 = await prisma.user.findUniqueOrThrow({
      where: { email: emails.gerente1 },
    });
    advisor1Uuid = operador1.uuid;
    advisor2Uuid = gerente1.uuid;

    const customer1 = await prisma.customer.create({
      data: {
        organizationId: org1Id,
        codcli: 'CONV-C1',
        name: 'Juan Perez',
        phone: '573000000001',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await prisma.customer.create({
      data: {
        organizationId: org2Id,
        codcli: 'CONV-C2',
        name: 'Otro Org',
        phone: '579999999999',
        status: 'ACTIVE',
      },
    });

    const c1 = await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customer1.id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
      },
    });
    conversationUuid = c1.uuid;
    const closed = await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customer1.id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'CLOSED',
      },
    });
    closedConversationUuid = closed.uuid;
    const archived = await prisma.conversation.create({
      data: {
        organizationId: org1Id,
        customerId: customer1.id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'ARCHIVED',
      },
    });
    archivedConversationUuid = archived.uuid;
    const org2Conv = await prisma.conversation.create({
      data: {
        organizationId: org2Id,
        customerId: null,
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
      },
    });
    org2ConversationUuid = org2Conv.uuid;

    const tag1 = await prisma.conversationTag.create({
      data: { organizationId: org1Id, name: 'VIP', color: '#0EA5E9' },
    });
    tag1Uuid = tag1.uuid;
    const tag2 = await prisma.conversationTag.create({
      data: { organizationId: org2Id, name: 'Otro', color: '#22C55E' },
    });
    tag2Uuid = tag2.uuid;

    await prisma.quickReply.create({
      data: {
        organizationId: org1Id,
        title: 'Confirmación',
        body: 'Hola, confirmamos su compra.',
        createdById: operador1.id,
      },
    });
  });

  afterAll(async () => {
    await seedPrisma.audit.deleteMany({ where: { module: 'conversations' } });
    await seedPrisma.audit.deleteMany({ where: { module: 'whatsapp' } });
    await seedPrisma.conversationNote.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.conversationTagAssignment.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.conversationTag.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.quickReply.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.message.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.conversation.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.customer.deleteMany({
      where: { organizationId: { in: [org1Id, org2Id] } },
    });
    await seedPrisma.userSession.deleteMany({
      where: { user: { email: { in: Object.values(emails) } } },
    });
    await seedPrisma.user.deleteMany({
      where: {
        OR: [
          { email: { in: Object.values(emails) } },
          { email: 'conv-asesor@org1.test' },
        ],
      },
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

  it('AS-001 — bandeja filters (assigned, tagIds) return tenant rows with tags', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .get('/api/v1/conversations?assigned=false&status=OPEN')
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);

    const body = res.body as { data: Array<{ uuid: string; tags: unknown[] }> };
    expect(body.data.some((c) => c.uuid === conversationUuid)).toBe(true);
    expect(body.data.every((c) => Array.isArray(c.tags))).toBe(true);

    const tagged = await request(app.getHttpServer())
      .get(`/api/v1/conversations?tagIds=${tag1Uuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((tagged.body as { data: unknown[] }).data).toHaveLength(0);
  });

  it('AS-009 — tag catalog: ADMINISTRADOR creates, OPERADOR forbidden, assign/remove, duplicate 409', async () => {
    const adminToken = await login(emails.admin1);
    const operadorToken = await login(emails.operador1);

    const created = await request(app.getHttpServer())
      .post('/api/v1/conversation-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Prospecto', color: '#F59E0B' })
      .expect(201);
    const prospectoUuid = (created.body as { data: { uuid: string } }).data
      .uuid;

    await request(app.getHttpServer())
      .post('/api/v1/conversation-tags')
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ name: 'NoPermitido' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/conversation-tags')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Prospecto' })
      .expect(409);

    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/tags/${tag1Uuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect(
      (assigned.body as { data: { tags: unknown[] } }).data.tags,
    ).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/conversations/${conversationUuid}/tags/${prospectoUuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/conversation-tags?name=Pro')
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('AS-001b — bandeja tagIds filter returns the tagged conversation', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations?tagIds=${tag1Uuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);

    const body = res.body as { data: Array<{ uuid: string }> };
    expect(body.data.some((c) => c.uuid === conversationUuid)).toBe(true);
  });

  it('AS-010 — notes are append-only and listed chronologically', async () => {
    const operadorToken = await login(emails.operador1);

    const created = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/notes`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ content: 'Cliente pide factura digital' })
      .expect(201);
    expect((created.body as { data: { content: string } }).data.content).toBe(
      'Cliente pide factura digital',
    );

    const list = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationUuid}/notes`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('AS-002 — conversation detail includes messages, tags, notes and advisor', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationUuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);

    const detail = res.body as {
      data: {
        uuid: string;
        messages: unknown[];
        notes: unknown[];
        tags: unknown[];
        advisor: unknown;
      };
    };
    expect(detail.data.uuid).toBe(conversationUuid);
    expect(Array.isArray(detail.data.messages)).toBe(true);
    expect(detail.data.notes).toHaveLength(1);
    expect(detail.data.tags).toHaveLength(1);
    expect(detail.data.advisor).toBeNull();
  });

  it('AS-008 — close/archive/reopen with events; repeated close → 400', async () => {
    const operadorToken = await login(emails.operador1);
    const collected = collectEvents();

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/close`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((closed.body as { data: { status: string } }).data.status).toBe(
      'CLOSED',
    );
    await delay(50);
    expect(collected).toContain('ConversationClosed');

    const archived = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/archive`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((archived.body as { data: { status: string } }).data.status).toBe(
      'ARCHIVED',
    );
    await delay(50);
    expect(collected).toContain('ConversationArchived');

    const reopened = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/reopen`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((reopened.body as { data: { status: string } }).data.status).toBe(
      'OPEN',
    );

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/close`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/close`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(400);
  });

  it('AS-003 — asesor reply creates an OUTGOING OUTBOUND message (SENT)', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/messages`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .set('Idempotency-Key', 'idem-reply-1')
      .send({ content: 'Hola, le confirmamos su compra.' })
      .expect(201);

    const data = res.body as {
      data: { type: string; direction: string; status: string };
    };
    expect(data.data).toMatchObject({
      type: 'OUTGOING',
      direction: 'OUTBOUND',
      status: 'SENT',
    });
  });

  it('AS-004 — reply to a CLOSED conversation reopens it to OPEN', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${closedConversationUuid}/messages`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ content: 'Retomamos la conversación.' })
      .expect(201);

    expect((res.body as { data: { type: string } }).data.type).toBe('OUTGOING');

    const conv = await prisma.conversation.findUniqueOrThrow({
      where: { uuid: closedConversationUuid },
    });
    expect(conv.status).toBe('OPEN');
  });

  it('AS-005 — reply to an ARCHIVED conversation → 400 VALIDATION_ERROR', async () => {
    const operadorToken = await login(emails.operador1);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${archivedConversationUuid}/messages`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ content: 'Nadie debería responder acá.' })
      .expect(400);

    expect((res.body as { error: { code: string } }).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('AS-006 — assign/transfer open to any role, with events; cross-tenant advisor → 400', async () => {
    const operadorToken = await login(emails.operador1);
    const gerenteToken = await login(emails.gerente1);
    const admin2Token = await login(emails.admin2);
    const collected = collectEvents();

    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/assign`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ advisorId: advisor1Uuid })
      .expect(200);
    expect(
      (assigned.body as { data: { advisor: { uuid: string } } }).data.advisor
        .uuid,
    ).toBe(advisor1Uuid);
    await delay(50);
    expect(collected).toContain('ConversationAssigned');

    const transferred = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/transfer`)
      .set('Authorization', `Bearer ${gerenteToken}`)
      .send({ advisorId: advisor2Uuid })
      .expect(200);
    expect(
      (transferred.body as { data: { advisor: { uuid: string } } }).data.advisor
        .uuid,
    ).toBe(advisor2Uuid);
    await delay(50);
    expect(collected).toContain('ConversationTransferred');

    const crossTenant = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${org2ConversationUuid}/assign`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ advisorId: advisor1Uuid })
      .expect(400);
    expect((crossTenant.body as { error: { code: string } }).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('AS-012 — cross-tenant conversation access and tag assignment → 404', async () => {
    const admin2Token = await login(emails.admin2);
    const operadorToken = await login(emails.operador1);

    const conv404 = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversationUuid}`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .expect(404);
    expect((conv404.body as { error: { code: string } }).error.code).toBe(
      'CONVERSATION_NOT_FOUND',
    );

    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${org2ConversationUuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(404);

    const tag404 = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/tags/${tag2Uuid}`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(404);
    expect((tag404.body as { error: { code: string } }).error.code).toBe(
      'TAG_NOT_FOUND',
    );
  });

  it('AS-011 — quick replies: ADMINISTRADOR CRUD, OPERADOR forbidden, used in replies', async () => {
    const adminToken = await login(emails.admin1);
    const operadorToken = await login(emails.operador1);

    const created = await request(app.getHttpServer())
      .post('/api/v1/quick-replies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Garantía', body: 'Su garantía está vigente.' })
      .expect(201);
    const quickReplyUuid = (created.body as { data: { uuid: string } }).data
      .uuid;

    await request(app.getHttpServer())
      .post('/api/v1/quick-replies')
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ title: 'No', body: 'No.' })
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/api/v1/quick-replies?title=Gar')
      .set('Authorization', `Bearer ${operadorToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);

    const reply = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/messages`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({
        content: 'Su garantía está vigente.',
        quickReplyId: quickReplyUuid,
      })
      .expect(201);
    expect((reply.body as { data: { status: string } }).data.status).toBe(
      'SENT',
    );

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/quick-replies/${quickReplyUuid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Garantía activa' })
      .expect(200);
    expect((updated.body as { data: { title: string } }).data.title).toBe(
      'Garantía activa',
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/quick-replies/${quickReplyUuid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('AS-013 — audit rows exist for the conversations module', async () => {
    const audits = await prisma.audit.findMany({
      where: { module: 'conversations', organizationId: org1Id },
      select: { action: true },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('conversation.assign.success');
    expect(actions).toContain('conversation.transfer.success');
    expect(actions).toContain('conversation.close.success');
    expect(actions).toContain('conversation.archive.success');
    expect(actions).toContain('conversation.reopen.success');
    expect(actions).toContain('conversation.note.create.success');
    expect(actions).toContain('conversation.tag.assign.success');
    expect(actions).toContain('quick_reply.create.success');
    expect(actions).toContain('quick_reply.use.success');

    const whatsappAudits = await prisma.audit.findMany({
      where: { module: 'whatsapp', organizationId: org1Id },
      select: { action: true },
    });
    expect(whatsappAudits.map((a) => a.action)).toContain(
      'message.send.success',
    );
  });

  it('AS-014 — same-advisor assignment is a no-op (no second event)', async () => {
    const operadorToken = await login(emails.operador1);
    const collected = collectEvents();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationUuid}/assign`)
      .set('Authorization', `Bearer ${operadorToken}`)
      .send({ advisorId: advisor2Uuid })
      .expect(200);
    expect(
      (res.body as { data: { advisor: { uuid: string } } }).data.advisor.uuid,
    ).toBe(advisor2Uuid);

    await delay(50);
    const assignEvents = collected.filter((e) => e === 'ConversationAssigned');
    expect(assignEvents).toHaveLength(0);
  });

  const EVENT_NAMES = [
    'ConversationAssigned',
    'ConversationTransferred',
    'ConversationClosed',
    'ConversationArchived',
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
