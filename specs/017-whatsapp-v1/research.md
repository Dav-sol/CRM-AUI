# WhatsApp/Messaging v1 — Research Notes

## R-001 — Models exist (schema.prisma:242-293)

`model Conversation` (:242-264): `organizationId`, `customerId` (NOT NULL today — HG-8 will make nullable), `advisorId?`, `channel` (default WHATSAPP_CLIENTS), `status` (default OPEN), timestamps; relations `organization`, `customer`, `advisor` (`ConversationAdvisor`), `messages[]`; indexes `[organizationId]`, `[customerId]`, `[advisorId]`, `[status]`. `model Message` (:266-293): `organizationId`, `conversationId` (NOT NULL), `automationId?`, `type`, `content`, `direction`, `status` (default QUEUED), `sentAt?`/`deliveredAt?`/`readAt?`, timestamps; relations `organization`, `conversation`, `automation?`; indexes `[organizationId]`, `[conversationId]`, `[automationId]`, `[status]`, `[createdAt]`. **Missing for v1**: `customer_id` nullable (HG-8), provider id columns on Message (HG-13), compound index `[organizationId, status]` on Conversation (list path FR-007) and `[organizationId, createdFrom]` paths.

## R-002 — Enums (schema.prisma:491-520)

`ChannelType {WHATSAPP_CLIENTS, WHATSAPP_SOCIAL}` — maps `02-modules.md:207-211` (WhatsApp Clientes / WhatsApp Redes Sociales). `ConversationStatus {OPEN, CLOSED, ARCHIVED}` — maps CO-003 (`03:310-319`); OPEN is the only v1-managed transition (HG-5). `MessageType {AUTOMATIC, MANUAL, INCOMING, OUTGOING}` and `MessageDirection {INBOUND, OUTBOUND}` — the four quadrants of `04-domain-model.md:153-162`. `MessageStatus {QUEUED, SENT, DELIVERED, READ, FAILED}` — maps `07:228-242` (MessageQueued/Sent/Delivered/Read/Failed). No enum changes required.

## R-003 — Event infrastructure ready

`@nestjs/event-emitter` installed + `EventEmitterModule.forRoot()` (`app.module.ts:27`); imports/automations emit via EventEmitter2 with envelopes (`imports.events.ts:4-28`, `automations.events.ts`). WhatsApp v1 emits `MessageQueued`, `MessageSent`, `MessageDelivered`, `MessageRead`, `MessageReceived`, `MessageFailed`, `ConversationOpened`, `AutomationExecuted`, `AutomationFailed` (`07:194-242`) with the traceability shape (07:383-395). Consumers: dashboard/audit (future); `AutomationExecuted` is emitted for the first time (reserved in 016, `spec.md:89`). A new `WhatsappEventEnvelope<T>` mirrors `AutomationEventEnvelope` (module: 'whatsapp', state union of message/conversation states).

## R-004 — Scheduler mechanism (HG-3, design)

`@nestjs/schedule` — `@Interval` (e.g. 60_000ms) or `@Cron` every minute. Tick queries `Automation.findMany({ where: { status: 'SCHEDULED', scheduledDate: { lte: now }, organization: { status: 'ACTIVE' } }, orderBy: { scheduledDate: 'asc' }, take: 100, include: { purchase: { include: { customer: true } } } })`. Per automation: if customer status !== ACTIVE (AU-005) → skip (leave SCHEDULED). Else transactional FR-002. `ScheduleModule.forRoot()` registered in the module. **Disabled when `NODE_ENV=test`** (NR-012) to keep e2e suites deterministic. **INFERENCIA** (mechanism not prescribed; coherent with imports R-010 in-process precedent; future swap to BullMQ 08:261).

## R-005 — Tenant enforcement pattern (precedent)

`TenantScopeGuard` MUST NOT be used (purchases/imports/automations precedent); tenant enforcement in the service layer (`findScoped` pattern). Cross-tenant access → 404 `CONVERSATION_NOT_FOUND`/`MESSAGE_NOT_FOUND`. Conversation and Message both carry `organizationId` directly (unlike CommercialCycle) → direct scoping (`findFirst({ where: { uuid, organizationId } })`). **Inbound webhook**: org resolved from `WHATSAPP_DEFAULT_ORGANIZATION_ID` env (HG-6); single channel in v1.

## R-006 — Role pattern (precedent + HG-11)

Reads + manual send: ALL authenticated roles (HG-11). This is a **deliberate extension** of the OPERADOR read-only precedent (R-006 of imports): the asesor must respond to conversations (Flujo 07, `01-mvp.md:48-53`; 02-modules.md:199-205). Guards: `apps/api/src/core/guards/{jwt-auth,roles}.guard.ts` + `core/decorators/roles.decorator.ts`. No write endpoint restricted in v1; provider config is env-only (HG-6).

## R-007 — Audit pattern (precedent)

`AuditIdentityService.record({module, action, outcome, userId, organizationId, description, metadata})` never-throws (`audit.identity.service.ts:52-64`); action = `{action}.{outcome}`. WhatsApp v1: `module: 'whatsapp'`, actions `message.send.success/.failure`, `message.received.success/.failure`, `conversation.opened.success/.failure`, `automation.executed/.failed`. For scheduler/system-triggered actions `userId = null`; `organizationId` from the automation's org or channel. Never log provider tokens or message PII (NR-009).

## R-008 — Provider adapter (HG-2, design)

`whatsapp.provider.ts` exposes an interface `WhatsAppProvider` with `sendMessage({ to, text }) → { providerMessageId, status }` and inbound parsing. v1 implementation `MetaWhatsAppProvider` using Node `fetch`:
- Send: `POST {WHATSAPP_API_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages` with `Authorization: Bearer {WHATSAPP_API_TOKEN}`, body `{ messaging_product: "whatsapp", to, type: "text", text: { body } }`.
- Inbound webhook: `POST /webhooks/whatsapp` — verify `X-Hub-Signature-256` (HMAC-SHA256 of body with `WHATSAPP_WEBHOOK_SECRET`) and `hub.mode=subscribe` verification GET.
- Status callbacks: `message.status` field updates (SENT/DELIVERED/READ/FAILED).
- Adapter returns normalized payloads (never leaks Meta shapes to the service). **INFERENCIA** (exact API endpoints per Meta Cloud API standard; to be validated against the live API in Phase 0 of implementation).

## R-009 — Customer identification by phone (Q6, design INFERENCIA)

Inbound `from` number normalized to digits-only (strip non-digits, optional leading `+`/country prefix). Lookup `Customer.findFirst({ where: { organizationId: CHANNEL_ORG, phone: { contains: normalizedSuffix }, deletedAt: null } })` — `Customer.phone` is free-form (`012-customers-v1/spec.md:27-28`, no E.164 enforced) and has `@@index([phone])` (`schema.prisma:107`). Because phone format is not normalized at the source, the match is a **best-effort suffix/digits match**; unknown → conversation with `customerId = null` (HG-8) + no customer reference. **INFERENCIA**: exact matching semantics require real-world phone data; the v1 strategy records the raw `from` in a future-proof column (`providerConversationId`/phone) — see data-model R-013. PII handling: phone numbers are business data, stored only as-is; never logged.

## R-010 — Conversation for automatic outbound (C-05, design)

`Message.conversationId` is NOT NULL. When an automatic/manual outbound occurs for a customer with no OPEN conversation, the system auto-opens a conversation for that customer (channel WHATSAPP_CLIENTS) and links the message to it — mirroring the inbound auto-open (Flujo 06). One OPEN conversation per customer per channel (unique active conversation: no schema constraint, enforced by find-or-create in a transaction with `channel` predicate). **INFERENCIA** (extension of Flujo 06 step 4 "abrir conversación si no existe" to outbound direction; keeps the FK valid).

## R-011 — Outbound lifecycle / provider failures (Q8, Q9)

Persist QUEUED → call provider (after commit, FR-003) → on ack update SENT + `sentAt`; on provider status callback update DELIVERED/READ + timestamps; on send error update FAILED (message) + emit `MessageFailed`/`AutomationFailed`; automation stays EXECUTED (AU-004). Provider timeouts mapped to `PROVIDER_ERROR` (502) for REST manual sends and FAILED state for automatic (NR-011). **INFERENCIA** (mechanism not prescribed; consistent with AU-004/AU-011 and event list).

## R-012 — OpenAPI scaffolds (state)

`specs/api/paths/messages.yaml`, `conversations.yaml` (0 bytes) + `specs/api/components/schemas/Message/` and `Conversation/` (7 files each, 0 bytes). Tags `Conversations` and `Messages` already defined (`info/tags.yaml:33-39`). Root `openapi.yaml` (a3ffbf8) wires paths via per-path `$ref` with `~1`-escaped JSON pointers. Webhook path is NOT part of the REST contract surface but documented in the spec (API_GUIDELINES §24 note). New paths follow the same wiring + re-run `api:lint`/`api:spectral`/`api:validate`.

## R-013 — Data model delta (HG-8, HG-13)

Additive only (R-017 of 016 precedent):
- `Conversation.customer_id` → nullable (`String?`) — HG-8.
- `Message.provider_message_id` → `String?` + unique index `(organization_id, provider_message_id)` — HG-13, idempotency backstop.
- `Message.provider_conversation_id` → `String?` — HG-13 (Meta conversation id for reconciliation).
- Index `Conversation [organizationId, status]` (FR-007) and `Message [organizationId, status]` (FR-009).
- No enum changes (R-002); no destructive transformations; no business backfills.

## R-014 — Migration caution (precedent imports R-018)

Generate via `npx prisma migrate dev --create-only --name add_whatsapp_v1_fields`, review SQL, apply. `customer_id` NOT NULL → nullable on an empty/fresh table in practice (Baterías del Caribe); verify no existing rows violate before relaxing (safe: relaxing never violates). Unique index on `(organization_id, provider_message_id)` allows multiple NULLs (Postgres) — messages without provider id unaffected.

## R-015 — Scheduler determinism in tests (NR-012)

`NODE_ENV=test` disables the tick (inject flag or `@Conditional`/guard in `WhatsappSchedulerService.onModuleInit`). e2e drives execution by calling the service method directly or via a test-only trigger — keeps `automations.e2e-spec.ts`/`imports.e2e-spec.ts` from running schedules during suites. **INFERENCIA** (design; precedent 016 cleanup of FK deps already exists).

## R-016 — Provider callbacks vs idempotency (US8)

Status callbacks (SENT/DELIVERED/READ) keyed by `providerMessageId`: `updateMany({ where: { organizationId, providerMessageId, status: X } })` guarded transitions (QUEUED→SENT, SENT→DELIVERED, DELIVERED→READ) so out-of-order/stale callbacks are no-ops. Replayed inbound webhooks → unique `(organizationId, providerMessageId)` P2002 → no-op (NR-006).

## R-017 — Webhook security (HG-4)

Verification GET: validate `hub.verify_token` matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, reply `hub.challenge`. POST: verify `X-Hub-Signature-256` HMAC over raw body with `WHATSAPP_WEBHOOK_SECRET`; invalid → 401 `INVALID_SIGNATURE`; valid but irrelevant payload → 202 (accepted, no-op). No JWT on the webhook route; it is not under `JwtAuthGuard` (public, provider-authenticated). **INFERENCIA** (provider standard).

## R-018 — Env vars (HG-6)

Add to `env.validation.ts` (Joi) + `.env.example`: `WHATSAPP_API_TOKEN` (required, min-length), `WHATSAPP_PHONE_NUMBER_ID` (required), `WHATSAPP_API_URL` (default `https://graph.facebook.com/v21.0`), `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (required), `WHATSAPP_WEBHOOK_SECRET` (required), `WHATSAPP_DEFAULT_ORGANIZATION_ID` (required in v1 — single-channel org resolution; optional field may default to first ACTIVE org — decision below). Secrets never logged, never committed; `.env` gitignored (precedent).

## R-019 — Test infrastructure (state)

Unit: 248/248; e2e: 108/108; combined 356/356 (automations closure 2026-08-15). WhatsApp suites: `whatsapp.service.spec.ts`, `whatsapp.provider.spec.ts` (mock fetch), `whatsapp.scheduler.spec.ts`, `whatsapp.controller.spec.ts`, `whatsapp.e2e-spec.ts` with org/role/bcrypt seed pattern. Coverage target >80% per module (Constitution X). `automations.e2e-spec.ts` may need cleanup extension if scheduler executes during other suites (NR-012 mitigates).

## R-020 — Message content limits (Q14, INFERENCIA)

Meta text-message limit 4096 characters; DTO caps `content` (e.g. `maxLength: 4096`, non-empty). Manual send validates customer has a phone (else 400 `CUSTOMER_NO_PHONE`, CL-006 context) — `INFERENCIA` (CL-006 is enforced by campaigns/automations consumers per `012-customers-v1/spec.md:27-28`; a manual send without phone cannot reach WhatsApp).
