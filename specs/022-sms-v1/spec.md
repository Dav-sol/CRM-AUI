# SMS v1 — Feature Specification

## 1. Purpose

SMS v1 adds SMS as the first outbound communication channel for CRM campaigns, post-sale follow-up journeys, and automations — without modifying the existing WhatsApp integration. The system routes `channel=SMS` automations through a pluggable `SmsProvider` abstraction (provider selected at deployment time, not hardcoded), records delivery status, tracks cost per message (estimated + actual) with SMS segment awareness, and preserves the existing anti-spam, opt-out, approval lifecycle, and attribution semantics.

A minimal `ChannelAccount` entity and `Purchase.source` enum are introduced to architecturally prepare the platform for WhatsApp V2 (social number isolation, CRM vs. social attribution) without implementing V2 now.

## 2. Clarifications (Q&A)

- **Q1: What is the scope of SMS v1?** → A1: SMS outbound for campaigns and automations (post-sale follow-up, guarantee, reactivation, recompurchase, etc.). Provider is pluggable; `NullSmsProvider` for dev/sandbox. Provider selection is a deployment-time decision (Human Gate #1 resolved: user selects after build). Inbound SMS (MO) is NOT implemented in v1; bidirectional SMS is documented as future if provider supports it. OUT: WhatsApp V2, AI, WACRM integration, email channel, inbox for SMS.
- **Q2: Where does `channel` live?** → A2: `Campaign.channel` and `Automation.channel` (snapshot at generation time). `Message.channel` (denormalized for query performance). `Conversation` is NOT involved for SMS one-way messages. The existing `ChannelType` enum gains `SMS` value.
- **Q3: How does SMS relate to conversations?** → A3: SMS v1 messages do NOT create Conversations. `Message.conversationId` becomes nullable; SMS messages link directly to `Message.customerId`. This avoids "false conversation experience" (Fase 9 constraint). If bidirectional SMS is added in the future, a Conversation with `channel=SMS` would be created at that time.
- **Q4: Who can create SMS campaigns?** → A4: Same as existing: all authenticated organization roles (ADMINISTRADOR, GERENTE, OPERADOR). No RBAC change.
- **Q5: What is the campaign lifecycle for SMS?** → A5: Identical to WhatsApp: DRAFT → APPROVED → ACTIVE → PAUSED ↔ ACTIVE → FINISHED | CANCELLED. New campaigns show only SMS selectable; WhatsApp shown as "Disponible próximamente". Existing WhatsApp campaigns continue executing normally.
- **Q6: How are SMS segments calculated?** → A6: GSM-7 encoding: 160 chars single segment, 153 per segment for multipart. UCS-2 (non-GSM chars): 70 chars single, 67 per segment. `countSmsSegments(content)` utility detects encoding and computes segments. Used for cost estimation (before activation) and stored on each `Message` after send.
- **Q7: How is cost tracked?** → A7: `estimatedCost` on preview/activation (segments × COP/segment from config). `actualCost` on Message after provider confirmation (provider may report actual segments). `segmentCount` and `currency` on every Message. Config: `SMS_COST_PER_SEGMENT` env var (default 100 COP), `SMS_CURRENCY` (default COP).
- **Q8: What about WhatsApp campaigns — are they blocked?** → A8: No. Existing WhatsApp campaigns continue. The campaign editor shows SMS enabled and WhatsApp/Email as "Próximamente" for NEW campaign creation. This is a UI-level restriction; the backend channel field accepts `WHATSAPP_CLIENTS` for backward compatibility.
- **Q9: How does the scheduler know which automations are SMS?** → A9: `Automation.channel` field (snapshot). The existing WhatsApp scheduler adds `channel: 'WHATSAPP_CLIENTS'` filter (minimal change). A new `SmsScheduler` picks `channel: 'SMS'` automations and routes through `SmsProvider`. Both schedulers use the same guarded `SCHEDULED→EXECUTING` pattern (AU-011).
- **Q10: What happens to opt-out/anti-spam for SMS?** → A10: Identical enforcement. `Customer.noContactAt` checked before execution. `commercialAllowed()` (3/60d + 3 days spacing) applies to COMMERCIAL SMS automations. TRANSACTIONAL SMS (post-sale follow-up) are never blocked.
- **Q11: Does SMS respect quiet hours for Colombia?** → A11: For COMMERCIAL purpose SMS, the executor checks local time (America/Bogota, UTC-5) against configurable quiet hours (default 20:00–09:00 per CRC/Bird documentation). TRANSACTIONAL SMS bypass quiet hours. Quiet hours are configurable via env.
- **Q12: What about `Purchase.source`?** → A12: New enum `PurchaseSource { CRM, SOCIAL_WHATSAPP }`. All existing purchases backfill to `CRM`. Future V2 inbound WhatsApp from social number will set `SOCIAL_WHATSAPP`. This preserves explicit attribution (Fase 8 constraint).
- **Q13: What about `ChannelAccount`?** → A13: New entity representing a messaging account (SMS provider credentials + sender identity per organization). Created from env/config in V1 (no full CRUD API). Used to attribute which account sent which message. V2 will add full CRUD for WhatsApp Redes / WhatsApp Principal separation.
- **Q14: What about reports.service.ts broken query?** → A14: Fix included in this sprint. The query selects columns (`automationCount`, `delivered`, etc.) that don't exist on `Campaign` model; replaced with `loadCampaignAttribution()` pattern.

## 3. User Stories

- **US1 (create SMS campaign)**: As a user, I create a campaign with `channel=SMS`, name, description, template, segment, and optional send date; it saves as DRAFT.
- **US2 (estimate before activation)**: As a user, I preview the segment and see estimated messages, estimated SMS segments, and estimated cost in COP before activating.
- **US3 (activate SMS campaign)**: As a user, I approve and activate an SMS campaign; automations are generated with `channel=SMS`, scheduled, and the scheduler executes them via the SMS provider.
- **US4 (delivery tracking)**: As a user, I see delivery status (SENT/DELIVERED/FAILED) and actual cost per message in campaign detail and message list.
- **US5 (pause/resume/cancel)**: As a user, I manage SMS campaigns identically to WhatsApp campaigns.
- **US6 (anti-spam enforced)**: As a platform, SMS campaigns respect opt-out, 3/60d commercial limit, and quiet hours for COMMERCIAL purpose.
- **US7 (attribution preserved)**: As a platform, CRM-origin purchases retain `source=CRM`; SMS automation attribution chains work identically to WhatsApp (campaign → message → automation → reply attribution if bidirectional added later).

## 4. Functional Requirements

- **FR-001**: `ChannelType` enum gains `SMS` value. Existing `WHATSAPP_CLIENTS`/`WHATSAPP_SOCIAL` unchanged.
- **FR-002**: New `ChannelAccount` model: `id`, `uuid`, `organizationId`, `channel`, `provider` (enum), `label`, `phoneNumber?`, `senderId?`, `status`, `isDefaultForChannel`, `metadata Json?`, timestamps. Org-scoped. Unique per `[organizationId, channel, provider, senderId?]`.
- **FR-003**: New `PurchaseSource` enum: `CRM`, `SOCIAL_WHATSAPP`. Default `CRM`. Migration backfills all existing purchases to `CRM`.
- **FR-004**: `Campaign` gains `channel ChannelType @default(WHATSAPP_CLIENTS)` and `channelAccountId String?`.
- **FR-005**: `Automation` gains `channel ChannelType @default(WHATSAPP_CLIENTS)` and `channelAccountId String?`. Snapshot from Campaign at generation time.
- **FR-006**: `Message` gains: `channel ChannelType?`, `customerId String?` (direct link), `channelAccountId String?`, `provider String?`, `estimatedCost Decimal? @db.Decimal(10,4)`, `actualCost Decimal? @db.Decimal(10,4)`, `currency String? @db.VarChar(3)`, `segmentCount Int?`, `failureReason String?`. `conversationId` becomes nullable. Backfill: existing messages get `channel='WHATSAPP_CLIENTS'`, `customerId` resolved via `conversation.customerId`.
- **FR-007**: `countSmsSegments(content: string): { segments: number, encoding: 'GSM_7' | 'UCS_2' }` — pure function, GSM-7 charset detection (0x00–0x7F excluding extended), segment limits: GSM-7 160/153, UCS-2 70/67.
- **FR-008**: `SmsProvider` interface (in `messaging/` module): `send(input: SmsSendInput): Promise<SmsSendResult>`, `getName(): string`. `SmsSendInput`: `to`, `from`, `content`, `organizationId`, `messageId?`, `idempotencyKey?`. `SmsSendResult`: `providerMessageId`, `segments?`, `cost?`, `currency?`. DI token `SMS_PROVIDER`.
- **FR-009**: `NullSmsProvider` (dev/sandbox): logs, returns `sms-sim-{uuid}` as providerMessageId, fakes segments = 1.
- **FR-010**: `SmsScheduler` (`@Interval(60_000)`): picks `channel='SMS'` automations where `status IN (SCHEDULED, ERROR)`, `scheduledDate <= now`, `retryCount < 3`, customer ACTIVE, `noContactAt: null`, campaign ACTIVE (if linked). Executes via `SmsExecutionService`.
- **FR-011**: `SmsExecutionService.executeOneAutomation(automationId)`: guarded `SCHEDULED/ERROR→EXECUTING`; creates `Message{channel: SMS, customerId, conversationId: null, type: AUTOMATIC, direction: OUTBOUND, status: QUEUED, segmentCount, estimatedCost}`; routes to `SmsProvider.send()`; on success: `markSent`, `Automation→EXECUTED`; on failure: `Automation→ERROR` + retry logic (same pattern as WhatsApp).
- **FR-012**: WhatsApp scheduler (`whatsapp.scheduler.ts`) adds `channel: 'WHATSAPP_CLIENTS'` to `executeDueAutomations` query filter. This is the ONLY change to the WhatsApp module in this sprint.
- **FR-013**: Quiet hours for COMMERCIAL SMS: configurable `SMS_COMMERCIAL_QUIET_HOURS_START` (default 20), `SMS_COMMERCIAL_QUIET_HOURS_END` (default 9), timezone `America/Bogota`. TRANSACTIONAL bypass.
- **FR-014**: Campaign `estimateSegment()` extended: per-stage template segment count × messages × `SMS_COST_PER_SEGMENT` when `channel=SMS`. Response includes `channel`, `estimatedMessages`, `estimatedSegments`, `estimatedCost`, `currency`.
- **FR-015**: Campaign create/update DTO: `channel` field (V1 allows only `SMS` for new campaigns; backend accepts `WHATSAPP_CLIENTS` for backward compat).
- **FR-016**: Webhook `POST /webhooks/sms`: provider-specific signature verification, status update handling (SENT/DELIVERED/FAILED mapping to `MessageStatus`), same machine as WhatsApp (`STATUS_TRANSITIONS`).
- **FR-017**: All existing anti-spam (opt-out `noContactAt`, `commercialAllowed()` 3/60d + 3d spacing) enforced identically for SMS automations.
- **FR-018**: Fix `reports.service.ts` broken query: replace direct Campaign column selects with `loadCampaignAttribution()` pattern (campaigns.service.ts:1625-1673).
- **FR-019**: Audit: `sms.send`, `sms.delivery`, `sms.failure` via `AuditIdentityService` (never-throw).
- **FR-020**: OpenAPI delta: `ChannelType` enum extended, `ChannelAccount` schema, Campaign/Automation/Message schemas extended, new `/webhooks/sms` path, segment preview response extended. SDK regenerated via orval.

## 5. Non-Functional Requirements

- **NR-001**: Tenant isolation: `organizationId` from JWT only; all SMS queries org-scoped via `ChannelAccount` and `Message.organizationId`.
- **NR-002**: Message status machine: QUEUED→SENT→DELIVERED→READ, QUEUED/SENT→FAILED. Identical to WhatsApp `STATUS_TRANSITIONS` (whatsapp.service.ts:1734-1758).
- **NR-003**: Idempotency: `Message.providerMessageId` unique per org (existing `@@unique`); outbound: provider idempotency key where supported (Bird supports; others: use automation guarded transition as idempotency mechanism).
- **NR-004**: Retry: max 3 (`MAX_AUTOMATION_RETRIES`); non-retryable provider errors → terminal ERROR; same pattern as whatsapp.service.ts.
- **NR-005**: No secrets in logs; `SmsProvider` implementations must not log API keys or message content.
- **NR-006**: Multi-instance safety: guarded row-level transitions (`updateMany` with status guard) prevent double-send. In-memory idempotency (WhatsApp pattern) is NOT replicated for SMS; rely on DB-level guards only.
- **NR-007**: All dates ISO 8601 UTC; quiet hours compared in `America/Bogota` (UTC-5).
- **NR-008**: Error envelope `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-009**: Spec-driven: this spec + data-model.md + contracts are source of truth before implementation.

## 6. Acceptance Scenarios

- **AS-001**: Create campaign with `channel=SMS` → 201, `channel` persisted, `CampaignCreated` emitted (US1, FR-015).
- **AS-002**: Preview SMS segment → response includes `estimatedMessages`, `estimatedSegments`, `estimatedCost`, `currency` (US2, FR-014).
- **AS-003**: Activate SMS campaign → `SCHEDULED` automations with `channel=SMS` generated; `SmsScheduler` picks and executes via `SmsProvider`; `Message{channel: SMS, segmentCount, estimatedCost}` created (US3, FR-010/011).
- **AS-004**: SMS provider returns delivery status via webhook → `Message` updated to DELIVERED/FAILED; `Automation` status updated (US4, FR-016).
- **AS-005**: Opt-out customer not contacted by SMS: `customer.noContactAt: null` filter in scheduler + segment (US6, FR-017).
- **AS-006**: COMMERCIAL SMS respects quiet hours 20:00–09:00 Bogota: automation deferred to 09:00 (US6, FR-013).
- **AS-007**: SMS cost estimate: 3 customers × 2 stages × 1 segment × 100 COP = 600 COP (US2, FR-014).
- **AS-008**: Long SMS content correctly segmented: 305 chars GSM-7 → 2 segments (160 + 145); UCS-2 content → correct encoding detection (FR-007).
- **AS-009**: WhatsApp scheduler does NOT pick SMS automations (FR-012); SMS scheduler does NOT pick WhatsApp automations (FR-010).
- **AS-010**: `Purchase.source=CRM` on all existing purchases after migration (FR-003).
- **AS-011**: `ChannelAccount` links message to provider/sender; org-scoped (FR-002).
- **AS-012**: reports.service.ts query returns correct data without Prisma validation error (FR-018).

## 7. Out of Scope (v1)

- WhatsApp V2 (social number, official API, inbox, AI, human handoff)
- Inbound SMS (MO) — bidirectional SMS
- Email channel
- WACRM integration
- Full CRUD API for `ChannelAccount` (seeded from config in V1)
- Budget alerts / cost caps
- BullMQ migration (out of scope; documented as future risk)
- Real-time delivery webhooks to frontend (polling only)
- Provider-specific template systems (Meta-approved templates for WhatsApp)

## 8. Known Conflicts (resolved via HG)

- **C-01** (provider selection): Provider not yet contracted. → **HG-1**: Build abstraction; `NullSmsProvider` for dev; provider selected at deployment time after build.
- **C-02** (new campaign channel): Should new campaigns allow WhatsApp? → **HG-2**: New campaigns show only SMS; WhatsApp "Próximamente". Backend accepts `WHATSAPP_CLIENTS` for backward compat.
- **C-03** (Message.conversationId NOT NULL): SMS one-way has no conversation. → **HG-3**: Make nullable; SMS messages use `customerId` direct link. Approved.
- **C-04** (Purchase.source): No source tracking today. → **HG-4**: Add `PurchaseSource` enum (CRM | SOCIAL_WHATSAPP), backfill CRM. Approved.
- **C-05** (SMS cost): What default rate? → **HG-5**: 100 COP/segment, configurable via env. Approved.
- **C-06** (reports fix): Broken query tangential to SMS. → **HG-6**: Include fix in this sprint. Approved.

## 9. Dependency Justification (AGENTS.md)

- **No new runtime dependencies**: `SmsProvider` interface is NestJS DI pattern (existing `WHATSAPP_PROVIDER` precedent); `@nestjs/schedule` already installed for `SmsScheduler`; `@nestjs/event-emitter` already installed for events.
- **Prisma migration**: strictly additive (new models + new columns + enum values + nullable change); no destructive changes; backfills are safe CRM defaults.
- **Env vars new**: `SMS_PROVIDER` (default `null`), `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER`, `SMS_API_URL`, `SMS_COST_PER_SEGMENT` (default 100), `SMS_CURRENCY` (default COP), `SMS_COMMERCIAL_QUIET_HOURS_START` (default 20), `SMS_COMMERCIAL_QUIET_HOURS_END` (default 9), `SMS_TIMEZONE` (default America/Bogota). All optional/with defaults for dev.
- **OpenAPI/SDK**: additive schemas + paths; regenerated via orval.

## 10. Role and Tenant Notes

- All SMS endpoints: same as campaigns — all authenticated org roles (HG-3 precedent).
- `TenantScopeGuard` NOT used (precedent 017/018/019); tenant enforcement in service layer.
- `ChannelAccount` org-scoped; cross-org access → 404.
- Events/audit carry ids and counts only (never message content, NR-009).
