# WhatsApp/Messaging v1 — Feature Specification

## 1. Purpose

The WhatsApp/Messaging module (Módulo 07 Conversaciones, `specs/02-modules.md:191-213`; roadmap v1 `02-modules.md:323`) is the execution and messaging engine deferred by Automatizaciones v1 (kit 016 HG-1/HG-2, `specs/016-automations-v1/spec.md:9,10,83,88`). It consumes the `AutomationCreated`-produced SCHEDULED automations, sends WhatsApp messages through Meta WhatsApp Cloud API (`08-system-architecture.md:345-347`), receives inbound messages (Flujo 06), opens and records conversations (Flujo 06/07), and owns the `Message` and `Conversation` aggregates (`04-domain-model.md:123-163`, `schema.prisma:242-293`). It completes the core event flow `AutomationCreated → Scheduler → WhatsApp → MessageSent → Conversation` (`07-event-architecture.md:52-61`).

## 2. Clarifications (Q&A)

- **Q1: What is the v1 scope?** → A1: Scheduler-based execution of SCHEDULED automations (Flujo 05, `05-user-flows.md:144-164`), automatic + manual outbound sending, inbound webhook reception (Flujo 06), conversation auto-open + message history (Flujo 06/07 reads), read REST endpoints. OUT: full inbox/assignment/tags (HG-5, kit 018), AU-006/007 (HG-10), AU-009 business hours (HG-9), templates (HG-7), BullMQ (HG-3).
- **Q2: Is a scheduler introduced now?** → A2: Yes (HG-3). `@nestjs/schedule` in-process (`08-system-architecture.md:271` Scheduler), coherent with Imports HG-3 (no BullMQ in v1). The tick scans due SCHEDULED automations by index `[status, scheduledDate]` in bounded batches. Future: swap to BullMQ (`08:261`) without changing the pipeline (precedent imports R-010).
- **Q3: Which provider?** → A3: Meta WhatsApp Cloud API (HG-2) via plain HTTPS (`fetch`) — no SDK dependency. Credentials via env vars only (HG-6, Constitution IX).
- **Q4: Is inbound reception in v1?** → A4: Yes (HG-4). Resolves the conflict with API_GUIDELINES §24 ("Webhooks: Versión futura"): inbound is required by Flujo 06 and MVP "Registrar respuestas" (`01-mvp.md:148`); the webhook endpoint follows the same response/error standards. Signature verification per provider.
- **Q5: How are conversations handled in v1?** → A5: Only auto-open on first inbound message (Flujo 06, `05-user-flows.md:178`) + read/history. Full inbox (assignment, tags, notes, quick replies — `02-modules.md:199-205`) is kit 018 (HG-5). Conversation states: OPEN default; CLOSED/ARCHIVED not managed in v1 (CO-003 states exist; transitions deferred).
- **Q6: How is the customer identified for inbound?** → A6: By WhatsApp phone number (Flujo 06 step 2, `05-user-flows.md:176`) matched to `Customer.phone` within the organization resolved from the channel (HG-6). Unknown numbers → conversation with `customerId = null` (HG-8). Matching strategy: normalized phone (digits-only, leading + omitted) — decision R-00x (research).
- **Q7: How does automatic execution work?** → A7: Scheduler tick → scan SCHEDULED automations with `scheduledDate <= now` and customer ACTIVE (AU-005, `03:215-218`) → for each, in ONE transaction: guard-update `SCHEDULED → EXECUTED` (predicate, AU-011 double-send guard `03:263-267`) + create OUTBOUND Message QUEUED + emit events after commit. No manual execution endpoint (HG-12). AU-006/007/009 not evaluated (HG-9/HG-10).
- **Q8: What happens with FAILED sends?** → A8: Message status → FAILED; Automation stays EXECUTED (AU-004, never re-runs `03:209-212`); `MessageFailed` emitted; retry is a future concern (out of scope v1).
- **Q9: How are statuses updated?** → A9: QUEUED → SENT (provider ack) → DELIVERED/READ (provider webhook status callbacks, `07:228-242`) | FAILED. `sentAt`/`deliveredAt`/`readAt` set accordingly (`schema.prisma:276-278`).
- **Q10: Which entity naming and tenancy apply?** → A10: Prisma models `Conversation` and `Message` stay as-is (naming aligned `04-domain-model.md:123-163`); tenant isolation via `organizationId` from JWT only (API_GUIDELINES §18) on REST, cross-tenant → 404 `CONVERSATION_NOT_FOUND`/`MESSAGE_NOT_FOUND` (precedent R-005). Inbound webhook resolves org from env channel config (HG-6), never from the request body.
- **Q11: Who can use WhatsApp v1?** → A11: Reads: all authenticated roles. Manual send: all roles including OPERADOR (HG-11 — the asesor responds in Flujo 07, `01-mvp.md:52`). Automatic execution is system-triggered (scheduler, no role).
- **Q12: How is idempotency enforced?** → A12: For inbound: unique `providerMessageId` backstop (HG-13, P2002 → no-op never 500, `07:375-379`). For outbound automatic: single-row `SCHEDULED → EXECUTED` status guard (AU-011) — never two messages for the same automation. For manual send: `Idempotency-Key` header (API_GUIDELINES §19).
- **Q13: Which events are emitted?** → A13: `MessageQueued`, `MessageSent`, `MessageDelivered`, `MessageRead`, `MessageReceived`, `MessageFailed` (`07:228-242`), `ConversationOpened` (`07:214-226`), `AutomationExecuted`/`AutomationFailed` (`07:194-196`, reserved in 016 `spec.md:89`) — with traceability payloads (07:383-395) and idempotent consumers (07:375-379).
- **Q14: What are the message content rules?** → A14: Text messages only in v1 (no media/templates, HG-7). Content length capped (e.g. 4096 chars, Meta limit) — decision R-00x. `type` AUTO= AUTOMATIC, MANUAL; inbound → INCOMING, outbound → OUTGOING (`MessageType`/`MessageDirection`).

## 3. User Stories

- **US1 (automatic execution)**: When a SCHEDULED automation's `scheduledDate` passes, the system sends the WhatsApp message to the ACTIVE customer, records the OUTBOUND Message (QUEUED→SENT→DELIVERED/READ), marks the automation EXECUTED (AU-004, AU-011) and emits `MessageSent` + `AutomationExecuted`.
- **US2 (manual send)**: As any user (including OPERADOR), I can send a WhatsApp message to a customer; an OUTBOUND Message is recorded and the provider is called.
- **US3 (inbound reception)**: When a customer replies on WhatsApp, the system identifies the customer by phone, records the INBOUND Message, opens a conversation if none exists (Flujo 06), and emits `MessageReceived` + `ConversationOpened`.
- **US4 (conversation history)**: As a user, I can view a conversation with its full message history (CO-002, CO-004).
- **US5 (list conversations/messages)**: As a user, I can list conversations (filtered by status/channel/customer/date) and messages (filtered by conversation/status/direction/date) with pagination.
- **US6 (audit)**: Every message/conversation action is audited (AD-001..003); audit failures never break the flow.
- **US7 (events)**: The module emits Message*/Conversation*/AutomationExecuted events with traceability payloads (07:214-242, 383-395).
- **US8 (idempotency)**: Replayed inbound webhooks or duplicated provider callbacks never create duplicate messages or conversations (07:375-379).

## 4. Functional Requirements

- **FR-001**: Scheduler (HG-3): `@nestjs/schedule` tick (e.g. every minute) scans `Automation` SCHEDULED with `scheduledDate <= now` and customer ACTIVE (AU-005), scoped per organization, in bounded batches (e.g. 100/tick) — US1.
- **FR-002**: For each due automation: ONE transaction — update `Automation` `SCHEDULED → EXECUTED` (`executedDate = now`) guarded by status predicate (AU-011, AU-004) + create OUTBOUND Message (QUEUED, `type=AUTOMATIC`, `direction=OUTBOUND`, content per automation/purchase) — US1 (NR-004/NR-005).
- **FR-003**: After commit, call provider; update Message `QUEUED → SENT` (`sentAt`) or `→ FAILED`; emit `MessageQueued`, `MessageSent`/`MessageFailed` + `AutomationExecuted`/`AutomationFailed` — US1, US7.
- **FR-004**: Manual send `POST /messages`: create OUTBOUND Message (MANUAL) + provider call (same lifecycle) — US2 (HG-11).
- **FR-005**: Inbound webhook `POST /webhooks/whatsapp`: verify provider signature (HG-4); resolve organization from env channel (HG-6); identify customer by normalized phone (Q6); find-or-open Conversation (Flujo 06, `ConversationOpened` on first message); create INBOUND Message (`type=INCOMING`, `direction=INBOUND`); emit `MessageReceived` — US3.
- **FR-006**: Status callbacks from provider (SENT/DELIVERED/READ/FAILED) update Message status + timestamps (Q9) — idempotent by providerMessageId — US1.
- **FR-007**: `GET /conversations` list: filters `status`, `channel`, `customerId`, `advisorId`, `createdFrom`/`createdTo`, pagination (≤100), sort whitelist; tenant-scoped — US5.
- **FR-008**: `GET /conversations/{uuid}`: detail with messages (CO-004, no N+1); cross-tenant/unknown → 404 `CONVERSATION_NOT_FOUND` — US4.
- **FR-009**: `GET /messages` list: filters `conversationId`, `status`, `direction`, `automationId`, date range, pagination, sort whitelist; tenant-scoped — US5.
- **FR-010**: `GET /messages/{uuid}`: detail; cross-tenant/unknown → 404 `MESSAGE_NOT_FOUND` — US4.
- **FR-011**: Roles: GET endpoints + POST send open to all authenticated roles (Q11, HG-11); automatic execution system-triggered.
- **FR-012**: Tenant: `organizationId` from JWT only on REST (API_GUIDELINES §18); webhook resolves org from env channel (HG-6); never from client body — Q10.
- **FR-013**: Audit: `message.send.success/.failure`, `message.received`, `conversation.opened`, `automation.executed/.failed` via `AuditIdentityService` (never-throw, US6).
- **FR-014**: Events (US7): emit `MessageQueued`, `MessageSent`, `MessageDelivered`, `MessageRead`, `MessageReceived`, `MessageFailed`, `ConversationOpened`, `AutomationExecuted`, `AutomationFailed` with traceability payloads (07:383-395).
- **FR-015**: Records never physically deleted; soft delete only (CO-003, CP-004, `06-database.md:329`).
- **FR-016**: No manual execution endpoint for automations (HG-12); only manual message send (FR-004).
- **FR-017**: Dates: ISO 8601 UTC (API_GUIDELINES §20-21).

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` only from JWT (API_GUIDELINES §18); webhook org resolution deterministic (env, HG-6).
- **NR-002**: Envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-003**: No N+1: conversation detail preloads messages via `include` (single query); lists paginated with count+findMany (precedent NR-003 of 016).
- **NR-004**: Transactional invariants: automation EXECUTED + Message creation atomic (FR-002); conversation open + first message atomic (FR-005).
- **NR-005**: Concurrency-safe transitions: single-row status-guarded updates (`SCHEDULED → EXECUTED`), unique `providerMessageId` backstop (P2002 → no-op never 500).
- **NR-006**: Idempotent event/state consumption (07:375-379).
- **NR-007**: Audit never-throw (AuditIdentityService pattern).
- **NR-008**: Controlled exceptions only; never leak internal errors (Constitution IX).
- **NR-009**: No secrets, credentials or PII in logs; provider token only via env (Constitution IX).
- **NR-010**: Date-only filters whole-day inclusive (precedent NR-010 of 016).
- **NR-011**: Provider failures isolated: a provider outage marks messages FAILED (recorded) but never crashes the tick or returns 5xx to REST callers beyond controlled `PROVIDER_ERROR`.
- **NR-012**: Scheduler disabled in test env (`NODE_ENV=test`) to keep e2e deterministic (precedent: avoid scheduler side effects in suites).

## 6. Acceptance Scenarios

- **AS-001**: A SCHEDULED automation with past `scheduledDate` and ACTIVE customer → one OUTBOUND Message created, automation EXECUTED, `MessageSent` + `AutomationExecuted` emitted (US1, FR-001/002/003).
- **AS-002**: The same automation cannot produce a second message (AU-011): concurrent ticks → single EXECUTED, single Message (US8, FR-002, NR-005).
- **AS-003**: INACTIVE/BLOCKED customer automation stays SCHEDULED, no message, no error (AU-005, FR-001).
- **AS-004**: Manual send → 201, Message OUTBOUND SENT, audit row (US2, FR-004, FR-013).
- **AS-005**: OPERADOR manual send → 200/201 (HG-11, FR-011).
- **AS-006**: Inbound webhook (valid signature) → customer identified, INBOUND Message, conversation OPENED, `MessageReceived` + `ConversationOpened` (US3, FR-005).
- **AS-007**: Inbound from unknown number → conversation with `customerId=null` created (HG-8, Q6).
- **AS-008**: Replayed inbound webhook (same providerMessageId) → no-op, no duplicate Message/Conversation (US8, FR-006, NR-006).
- **AS-009**: Conversation detail returns full message history in one query (US4, FR-008, NR-003).
- **AS-010**: List conversations/messages with filters + pagination (US5, FR-007/009).
- **AS-011**: Cross-tenant conversation/message access → 404 (FR-012, Q10).
- **AS-012**: Failed provider send → Message FAILED, `MessageFailed` + `AutomationFailed` emitted; no retry, no crash (Q8, FR-003, NR-011).
- **AS-013**: Audit rows exist for send/received/conversation.opened/automation.executed (FR-013, US6).
- **AS-014**: Dates ISO 8601 UTC; date-only filters whole-day inclusive (FR-017, NR-010).

## 7. Out of Scope (v1)

- Full conversations inbox: assignment, tags, notes, quick replies — HG-5, kit 018 (`02-modules.md:199-205`).
- AU-006/007 (pause on open conversation, advisor notification) — HG-10 (`03:221-241`, `07:294-303`; `PAUSED` reserved).
- AU-009 (business hours) — HG-9, future Configuración module (`03:251-255`).
- AU-010 (max 1 per period + campaign priority) — future Campañas module.
- Message templates/plantillas — HG-7 (`03:271-275` CA-001; Módulo 10 Configuración `02-modules.md:270`).
- BullMQ/Redis/worker app — HG-3 (`08:261` future).
- Media/attachments/template messages in provider payloads — text only (Q14).
- Manual automation execution endpoint — HG-12 (FR-016).
- Multi-tenant channel configuration (per-org WhatsApp numbers) — HG-6, Módulo 10.
- Dashboard consumers of Message*/Conversation* events — future.
- Retry of FAILED messages — future.
- `ConversationClosed/Archived/Assigned/Transferred` transitions — kit 018.

## 8. Known Conflicts (resolved via HG)

- **C-01** (webhooks vs API_GUIDELINES §24): §24 states webhooks are "Versión futura" but Flujo 06 and MVP "Registrar respuestas" (`01-mvp.md:148`) require inbound reception. → **HG-4**: inbound webhook implemented in v1 following the same standards.
- **C-02** (customerId NOT NULL vs unknown inbound): `Conversation.customerId` is required (`schema.prisma:246`) but Flujo 06 may receive numbers without a known customer. → **HG-8**: `customerId` nullable + pending conversation.
- **C-03** (execution dependency): AU-001 automations are SCHEDULED but no executor exists (016 HG-1/HG-2). → **HG-3/HG-12**: scheduler in v1; execution scheduler-driven without manual endpoint.
- **C-04** (OPERADOR manual send vs precedent): precedent makes OPERADOR read-only (016 Q11) but the asesor responds in Flujo 07 (`01-mvp.md:52`). → **HG-11**: OPERADOR may send manually; reads all roles.
- **C-05** (conversation/message relation): `Message.conversationId` is NOT NULL (`schema.prisma:270`) but automatic outbound may precede any conversation. → **R-00x (research)**: automatic outbound creates/uses the customer's conversation (auto-open on first outbound too), keeping the FK valid — decision recorded, no schema change needed.

## 9. Dependency Justification (AGENTS.md)

- `@nestjs/schedule` (**NEW**, HG-3): required for the scheduler (Flujo 05, `08:271`); coherent with Imports HG-3 (in-process, no BullMQ). Single new runtime dependency; swapped to BullMQ later without pipeline change (R-010 precedent).
- `@nestjs/event-emitter` (installed): emit/consume Message*/Conversation*/AutomationExecuted events (`07:214-242`).
- No WhatsApp SDK: plain `fetch` to Meta Cloud API (HG-2) — avoids a provider SDK dependency; adapter isolated in `whatsapp.provider.ts`.
- Env vars: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_URL` (default `https://graph.facebook.com/v21.0`), `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, optional `WHATSAPP_DEFAULT_ORGANIZATION_ID` (HG-6) — added to `env.validation.ts` + `.env.example`.

## 10. Role and Tenant Notes

- All reads + manual send open to every authenticated role (Q11, HG-11); no write-restricted endpoint in v1 besides provider config (env-only).
- `TenantScopeGuard` MUST NOT be used (precedent R-005); tenant enforcement in the service layer (`findScoped` pattern). Cross-tenant → 404 (never disclosure, precedent).
- Automatic execution and inbound reception run in the organization resolved from the channel (HG-6), never cross-tenant.
- Webhook endpoint: signature verification (HG-4) — invalid signature → 401 `INVALID_SIGNATURE`; valid but unknown payload → 202 accepted (no-op).
