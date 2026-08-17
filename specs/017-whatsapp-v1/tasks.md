# WhatsApp/Messaging v1 — Tasks

## Phase 0 — Research & gates (done)

- T152: Kit 017-whatsapp-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-13 approved 2026-08-17 (plan.md Constitution Check PASS).

## Phase 1 — Persistence (migration)

- [ ] T153: Prisma schema delta (per data-model.md): `Conversation.customerId` → nullable (HG-8); `Message.providerMessageId` + `providerConversationId` (HG-13); `@@unique([organizationId, providerMessageId])` on Message; indexes `[organizationId, status]` on Conversation and Message. No enum changes (R-002).
- [ ] T154: Generate migration (`add_whatsapp_v1_fields`), SQL reviewed per data-model.md (relax `customer_id` NOT NULL; add nullable columns; create unique + 2 indexes), applied, `prisma migrate status` + typegen verified.

## Phase 2 — Domain (whatsapp module)

- [ ] T155: `dto/query-conversations.dto.ts`, `dto/query-messages.dto.ts`, `dto/message-path-params.dto.ts`, `dto/conversation-path-params.dto.ts`, `dto/send-message.dto.ts` (class-validator; pagination/filters/sort whitelist per contracts; content 1..4096 R-020; channel enum).
- [ ] T156: `whatsapp.events.ts` — envelope + builders (`WhatsappEventEnvelope<T>` mirroring `AutomationEventEnvelope`; module `whatsapp`) for `MessageQueued`, `MessageSent`, `MessageDelivered`, `MessageRead`, `MessageReceived`, `MessageFailed`, `ConversationOpened`, `AutomationExecuted`, `AutomationFailed` (07:194-242) with traceability payloads (07:383-395).
- [ ] T157: `whatsapp.provider.ts` — interface `WhatsAppProvider` + `MetaWhatsAppProvider` (plain `fetch`, HG-2): `sendMessage`, inbound payload parse, status callback parse; normalized DTOs; isolated so provider internals never leak to service (R-008).
- [ ] T158: `whatsapp.service.ts`:
  - `executeDueAutomations()` (scheduler entry): scan SCHEDULED `scheduledDate <= now` + ACTIVE customer (AU-005), bounded batches (100/tick); per due automation one transaction: status-guarded `SCHEDULED → EXECUTED` (AU-011/AU-004) + find-or-open conversation (R-010) + create OUTBOUND AUTOMATIC Message QUEUED; after commit call provider, update QUEUED → SENT/FAILED (R-011); emit `MessageQueued`, `MessageSent`/`MessageFailed`, `AutomationExecuted`/`AutomationFailed`; audit (FR-013).
  - `sendManualMessage()` (US2, FR-004): validate customer exists + has phone (R-020), find-or-open conversation, create OUTBOUND MANUAL Message, provider call, status update, events, audit; Idempotency-Key honored (API_GUIDELINES §19).
  - `handleWebhook()` (US3, FR-005): signature verify (R-017), org from env channel (HG-6), customer identification by normalized phone (R-009), find-or-open conversation, create INBOUND Message, emit `MessageReceived` + `ConversationOpened` on first; P2002 → no-op (NR-006).
  - `handleStatusCallback()` (FR-006): guarded `updateMany` QUEUED→SENT→DELIVERED→READ (R-016) + FAILED; set `sentAt/deliveredAt/readAt`; emit `MessageSent/Delivered/Read/Failed`; stale → no-op.
  - `listConversations`/`getConversation` (detail preloads messages, one query NR-003) / `listMessages`/`getMessage` — tenant via own `organizationId` (R-005), cross-tenant → 404; audit hooks never-throw.
- [ ] T159: `whatsapp.scheduler.ts` — `@nestjs/schedule` tick (every minute) invoking `executeDueAutomations()`; disabled when `NODE_ENV=test` (NR-012); `ScheduleModule.forRoot()`; dependency `@nestjs/schedule` (HG-3, section 9 spec).
- [ ] T160: `whatsapp.controller.ts` — `GET /conversations`, `GET /conversations/{uuid}`, `GET /messages`, `GET /messages/{uuid}`, `POST /messages` (manual send, all roles HG-11), `POST /webhooks/whatsapp` (public, provider-authenticated HG-4); `@Roles` open on reads+send (FR-011); no manual automation execution endpoint (HG-12, FR-016); `WhatsappModule` registered in AppModule.
- [ ] T161: `env.validation.ts` + `.env.example` — add `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_URL` (default), `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_DEFAULT_ORGANIZATION_ID` (R-018). Secrets only via env (Constitution IX).

## Phase 3 — Tests

- [ ] T162: Unit `whatsapp.service.spec.ts` — executeDueAutomations: sends ACTIVE customer (AS-001), AU-011 no double send under concurrent ticks (AS-002), INACTIVE/BLOCKED skip stays SCHEDULED (AS-003), conversation find-or-open (R-010), provider failure → FAILED + `MessageFailed`/`AutomationFailed` (AS-012), status callbacks guarded/stale no-op (AS-008), inbound identify/open/unknown→null customer (AS-006/007), P2002 no-op replay, manual send (AS-004), tenant scoping + 404 (AS-011), Idempotency-Key reuse. ~30 cases.
- [ ] T163: Unit `whatsapp.controller.spec.ts` — roles all authenticated incl OPERADOR (AS-005), envelope (NR-002).
- [ ] T164: Unit `whatsapp.provider.spec.ts` — fetch mocked: send request shape, auth header, error mapping (R-008/R-011), inbound/status parse.
- [ ] T165: Unit `whatsapp.scheduler.spec.ts` — tick invokes execution; disabled in test env (NR-012).
- [ ] T166: e2e `whatsapp.e2e-spec.ts` — manual send 201 + OPERADOR ok (AS-004/005), inbound signed webhook opens conversation + INBOUND message (AS-006), unknown number null customer (AS-007), replay no-op (AS-008), history detail (AS-009), list filters/pagination (AS-010), cross-tenant 404 (AS-011), audit rows (AS-013), automation executed + events (AS-001/AS-007 combos). ~12 cases.

## Phase 4 — OpenAPI

- [ ] T167: `specs/api/components/schemas/Conversation/` + `specs/api/components/schemas/Message/` (Summary/Detail/ListResponse/Response per contracts) + `specs/api/paths/conversations.yaml` + `specs/api/paths/messages.yaml` (read + manual send endpoints) wired into root `specs/api/openapi.yaml` with `~1`-escaped `$ref`; tags Conversations/Messages exist; `npm run api:validate` green.

## Phase 5 — Gates & delivery

- [ ] T168: Lint/typecheck/format; `nest build`; unit + e2e suites green; coverage target >80% (whatsapp module); `automations.e2e-spec.ts` cleanup checked (no scheduler side effects in other suites, NR-012).
- [ ] T169: Update spec checklist (checklists/requirements.md → done/notes); review diff (no unrelated files, no secrets); Conventional Commit `feat(whatsapp): implement whatsapp v1` (no push unless requested).

## Out of scope (explicit)

Full conversations inbox (assignment/tags/notes/quick replies — HG-5, kit 018), AU-006/007 (HG-10), AU-009 business hours (HG-9), AU-010 campaigns (HG-4 of 016), templates (HG-7), BullMQ/Redis worker (HG-3), media/template messages (Q14), manual automation execution endpoint (HG-12), multi-tenant channel config (HG-6), dashboard consumers, retries of FAILED messages, ConversationClosed/Archived/Assigned/Transferred transitions (kit 018).