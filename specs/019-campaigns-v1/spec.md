# Campaigns v1 — Feature Specification

## 1. Purpose

The Campaigns module (Módulo 06 Campañas, `specs/02-modules.md:165-189`) delivers the commercial campaign workflow promised as the MVP goal ("Automatizar campañas de WhatsApp", `01-mvp.md:33`) and the deferred scope of kit 016 (`AU-010`, `CA-001..003` → "future Campañas module") and kit 017/018 (campaigns OUT). It creates org-scoped campaigns (name, description, type, message template, segment, send date), transitions them through a lifecycle (DRAFT → ACTIVE → PAUSED → FINISHED | CANCELLED, `HG-5`), and on activation generates one `SCHEDULED` Automation per qualifying customer (one campaign can generate thousands of automations, `04-domain-model.md:119`), which the existing kit-017 WhatsApp scheduler then executes. It emits the `CampaignCreated/Updated/Activated/Finished/Cancelled` events of `07-event-architecture.md:200-210`.

## 2. Clarifications (Q&A)

- **Q1: What is the kit 019 scope?** → A1: Campaign CRUD (DRAFT), lifecycle (activate/pause/resume/cancel + auto-finish), segment definition + dry-run preview, and bulk automation generation on activation. OUT: AU-010 (window/priority policy → Configuración, HG-4), real plantillas (HG-2 → Configuración), AU-009 business hours, predefined segment presets, statistics/reporting, WhatsApp SOCIAL, retries, dashboard consumers (HG-9).
- **Q2: What is the campaign "template"?** → A2: Free text stored on `Campaign.template` (HG-2, `06-database.md:185` "plantilla"). There is **no Template entity** in v1 (real message templates → Módulo 10 Configuración, 017 HG-7). The template supports `{customerName}`, `{productName}`, `{organizationName}` placeholders replaced at execution. See HG-2.
- **Q3: Who can manage campaigns?** → A3: **All authenticated organization roles** (ADMINISTRADOR, GERENTE, OPERADOR) — create, update, activate, pause, resume, cancel, preview (HG-3). No `@Roles` restriction (JwtAuthGuard only).
- **Q4: What is the campaign lifecycle?** → A4: `DRAFT` (created) → `APPROVED` (marketing approves, playbook §20) → `ACTIVE` (activated; future `startAt` = "Programada") → `PAUSED` ↔ `ACTIVE`; `ACTIVE/PAUSED` → `FINISHED` (auto when no `SCHEDULED` automations remain) or `CANCELLED` (terminal, cancels pending automations). Activation requires APPROVED. Pause keeps automations `SCHEDULED`; the scheduler skips automations of non-ACTIVE campaigns. No `SCHEDULED` enum value (HG-5). See HG-5.
- **Q5: How is the segment defined?** → A5: Optional filters combined with AND (HG-7): `city` (case-insensitive contains, consistent with customers list), `productId` (product uuid), `purchaseFrom`/`purchaseTo` (whole-day inclusive dates), `customerStatus` (ACTIVE/INACTIVE/BLOCKED). **At least one criterion required.** Stored on the campaign as a JSON column (segment is part of the reusable campaign configuration, `04-domain-model.md:117`). See HG-7.
- **Q6: Which customers are targeted?** → A6: Only customers with **at least one purchase** (HG-6; `Automation.purchaseId` is NOT NULL and stays NOT NULL). One automation per qualifying customer, using the customer's **most recent qualifying purchase**. Campaigns do not modify customer/purchase data — they only generate messages (CA-002).
- **Q7: When do the messages send?** → A7: Activation schedules each automation with `scheduledDate = max(campaign.startAt, now)`, `status = SCHEDULED`; the existing scheduler executes due automations (kit 017). If `startAt` is in the past or absent, the automations are scheduled immediately (next tick).
- **Q8: How are automations generated safely?** → A8: The activation transaction (a) guards `APPROVED → ACTIVE` (single-row update, NR-005 precedent — a concurrent second activation fails), (b) resolves the segment, (c) validates the customer count against `MAX_AUTOMATIONS_PER_CAMPAIGN` (constant, default 5.000; over limit → `400 SEGMENT_TOO_LARGE`), (d) creates automations in batches of 500 within the same transaction (HG-8). Any failure rolls back; the campaign stays `APPROVED`. Sequence stages are generated with `purpose = TRANSACTIONAL`; the repurchase conversion and legacy single-template sends with `purpose = COMMERCIAL`, each gated by the anti-spam rule (playbook §14: max 3 COMMERCIAL automations per customer per 60 days; transactional never blocked). F4: when a past WARRANTY_EXPIRY stage fires the repurchase conversion for a purchase (the conversion additionally requires the warranty to have really expired — Q17), later post-warranty recompra stages of that purchase (offsetDays > 0) are substituted by that single conversion — one renovation contact per cycle (playbook §11); transactional/warranty stages are untouched. The decision is taken before any automation is created, so it does not depend on the order of the stages array.
- **Q9: How does a campaign reach FINISHED?** → A9: The campaigns module consumes `AutomationExecuted` (`07-event-architecture.md:195`, emitted by the whatsapp module, `whatsapp.service.ts:334`). On each execution of an automation with a `campaignId`, it counts remaining `SCHEDULED` automations of that campaign; when zero → guarded `ACTIVE → FINISHED`, emit `CampaignFinished`, audit. Idempotent (guarded update).
- **Q10: What does pause/cancel do to automations?** → A10: Pause (`ACTIVE → PAUSED`) only flips the campaign; automations remain `SCHEDULED` but the scheduler where-clause excludes campaigns ≠ `ACTIVE`. Cancel (`ACTIVE/PAUSED → CANCELLED`) additionally cancels all pending `SCHEDULED` automations of the campaign (`updateMany` → `CANCELLED`). Cancel is terminal (no resume).
- **Q11: Tenant isolation?** → A11: `organizationId` from JWT only (API_GUIDELINES §18); campaigns, segments and generated automations are org-scoped; cross-tenant → 404 `CAMPAIGN_NOT_FOUND` (never disclosure).
- **Q12: Events?** → A12: `CampaignCreated`, `CampaignUpdated`, `CampaignActivated`, `CampaignFinished`, `CampaignCancelled` (07:200-210) with traceability payloads (07:383-395), emitted after commit; consumers idempotent (07:375-379). Pause emits `CampaignUpdated`; resume emits `CampaignActivated`. No per-automation events in v1 (`CampaignActivated` carries `automationCount`).
- **Q13: What is `CampaignType`?** → A13: Informational metadata in v1 (AUTOMATIC/MANUAL/REPURCHASE/SPECIAL); no behavioral differences implemented. Future Configuración/campaign engines may attach rules.
- **Q14: Does the campaign modify WhatsApp/AU-010 behavior?** → A14: No window/priority policy in v1 (AU-010 deferred, HG-4). `Automation.priority` is set to 0; the existing scheduler ordering is unchanged. No hardcoded "max 1 campaign per period".
- **Q15: What happens to a stage dated after the purchase's warranty ends?** → A15: Not generated. A `PURCHASE_DATE` stage whose computed date is after **that purchase's** `warrantyExpiresAt` is skipped at generation time (FR-015). The bound is the purchase's own expiry date — never a fixed duration per warranty length — so recurring reviews (+60, +120, …) cover every warranty length and no message asks to "review to keep the warranty valid" after it has expired. Purchases without `warrantyExpiresAt` are not bound (consistent with HG-SEM-05 for `WARRANTY_EXPIRY` stages). Human decision 2026-09-27 (no recurrence concept added to the model; see C-10).
- **Q16: Does a purchase created after activation join an ACTIVE campaign?** → A16: Yes (FR-016). Activation generates stages only for purchases that exist at that time; 016 emits `CommercialCycleStarted` after creating the new purchase's cycle, and the campaigns module enrolls that purchase in every `ACTIVE` campaign whose segment matches it, using the same per-customer rule (most recent qualifying purchase, C-06), idempotently (AU-011) and within `MAX_AUTOMATIONS_PER_CAMPAIGN`. Previous purchases of the same customer are **not** cancelled — each purchase keeps its own lifecycle (016 C-06, human decision 2026-09-27).
- **Q17: A D−30 stage is already overdue at generation — does that mean the warranty expired?** → A17: No (human decision 2026-09-27). The meaning of a past stage comes from its **offset in the lifecycle** *and* from `warrantyExpiresAt`, never from `scheduledDate < reference` alone (021 Q6/FR-005). With the warranty still valid, the overdue `offsetDays < 0` stage yields a single `TRANSACTIONAL` catch-up at `reference` with its own proximity message; it does **not** fire the repurchase conversion and does **not** trigger F4, so later `offsetDays > 0` stages (+60/+90) are kept. With the warranty really expired (`warrantyExpiresAt <= reference`), the conversion applies once (`COMMERCIAL`, message taken from an `offsetDays >= 0` stage) and F4 collapses the later post-warranty stages into that single contact.

## 3. User Stories

- **US1 (create)**: As a user, I create a campaign with name, description, type, message template, segment filters and an optional send date; the campaign is saved as DRAFT (Flujo 08 steps 1-7).
- **US2 (list/detail)**: As a user, I list campaigns (filters/status/type/search) and open a campaign to see its configuration, segment, send date and automation stats.
- **US3 (update)**: As a user, I edit a DRAFT or APPROVED (pre-activation) campaign's configuration.
- **US4 (segment preview)**: As a user, I dry-run the segment to see how many customers the campaign would target.
- **US5 (approve/activate)**: As a user, I approve a DRAFT campaign (DRAFT → APPROVED) and then activate it; one SCHEDULED automation per qualifying customer is created and the campaign becomes ACTIVE (Programada if `startAt` is future).
- **US6 (pause/resume)**: As a user, I pause an ACTIVE campaign (automations stop sending) and resume it later.
- **US7 (cancel)**: As a user, I cancel an ACTIVE/PAUSED/DRAFT/APPROVED campaign; pending automations are cancelled and the campaign is terminal.
- **US8 (finish)**: A campaign becomes FINISHED automatically once all its automations have executed.
- **US9 (events)**: The module emits `CampaignCreated/Updated/Activated/Finished/Cancelled` with traceability payloads and idempotent consumers.
- **US10 (audit)**: Every campaign action is audited (AD-001..003); audit failures never break the flow.

## 4. Functional Requirements

- **FR-001**: `POST /campaigns` — create as DRAFT: `name` (required, 1..120), `description?` (≤1000), `type` (CampaignType, required), `template` (required, 1..4096), `segment?` (≥1 criterion, validated nested), `startAt?` (ISO date-time). Emit `CampaignCreated`, audit `campaign.create`. — US1.
- **FR-002**: `GET /campaigns` — list org campaigns: `page`/`limit` (≤100), `sort` whitelist (`-createdAt` default, `createdAt`, `updatedAt`, `name`, `status`, `type`, `startAt`), `status?`, `type?`, `search?` (name contains, case-insensitive), `createdFrom?`/`createdTo?` (whole-day inclusive). Rows include `automationCount` and `executedCount` (groupBy, no N+1). — US2.
- **FR-003**: `GET /campaigns/{uuid}` — detail: full config + `segment`, `startAt`, stats; cross-tenant/unknown → 404 `CAMPAIGN_NOT_FOUND`. — US2.
- **FR-004**: `PATCH /campaigns/{uuid}` — update only while DRAFT or APPROVED (else `400 VALIDATION_ERROR`); fields optional (≥1); duplicates `campaign.create` validation for changed fields. Emit `CampaignUpdated`, audit `campaign.update`. — US3.
- **FR-004b**: `POST /campaigns/{uuid}/approve` — guarded `DRAFT → APPROVED` (playbook §20: marketing approves before the platform executes); emit `CampaignUpdated`, audit `campaign.approved`. — US5.
- **FR-005**: `POST /campaigns/{uuid}/preview-segment` — dry-run: resolve the stored segment, return `{ count }` of qualifying customers (no automations created, no PII returned). Audit `campaign.preview_segment`. — US4.
- **FR-006**: `POST /campaigns/{uuid}/activate` — guarded `APPROVED → ACTIVE` + segment resolution + count limit (`SEGMENT_TOO_LARGE` 400) + batch-create automations (500/batch) in one transaction (NR-005); `scheduledDate = max(startAt, now)`, `status = SCHEDULED`, `priority = 0`; one automation per customer (most recent purchase); purpose per classification (Q8); audit `campaign.activate` + `campaign.automations.generated`; emit `CampaignActivated` (with `automationCount`). — US5.
- **FR-007**: `POST /campaigns/{uuid}/pause` — guarded `ACTIVE → PAUSED`; automations stay SCHEDULED (scheduler skips non-ACTIVE campaigns); emit `CampaignUpdated`, audit `campaign.pause`. — US6.
- **FR-008**: `POST /campaigns/{uuid}/resume` — guarded `PAUSED → ACTIVE`; emit `CampaignActivated`, audit `campaign.resume`. — US6.
- **FR-009**: `POST /campaigns/{uuid}/cancel` — guarded from DRAFT/APPROVED/ACTIVE/PAUSED → CANCELLED (terminal); cancels pending `SCHEDULED` automations (updateMany → CANCELLED); emit `CampaignCancelled`, audit `campaign.cancel`. — US7.
- **FR-010**: Finish detection — `@OnEvent('AutomationExecuted')`: for automations with `campaignId`, count remaining `SCHEDULED` automations of the campaign; zero → guarded `ACTIVE → FINISHED`, emit `CampaignFinished`, audit `campaign.finish`; idempotent. — US8.
- **FR-011**: No DELETE endpoint in v1; records never physically deleted (CO-003, CA-002); `CANCELLED`/`FINISHED` are terminal states. — US7/US8.
- **FR-012**: WhatsApp execution integration (additive): scheduler executes campaign automations only when the campaign is `ACTIVE`; message content = campaign `template` with `{customerName}`/`{productName}`/`{organizationName}` replaced (fallback `AUTOMATIC_TEMPLATE` for non-campaign automations). — US5/US8.
- **FR-013**: Audit via `AuditIdentityService` (never-throw): `campaign.create/.update/.activate/.pause/.resume/.cancel/.finish`, `campaign.preview_segment`, `campaign.automations.generated` — US10.
- **FR-014**: Dates ISO 8601 UTC; date-only segment filters whole-day inclusive (API_GUIDELINES §20-21, NR-010 precedent).
- **FR-015**: Generation cap (Q15, C-10): a `PURCHASE_DATE` stage whose computed date (`purchaseDate + offsetDays`) is after that purchase's `warrantyExpiresAt` is skipped; no cap when `warrantyExpiresAt` is null. Applies to activation (FR-006) and to enrollment (FR-016) because both share the same generation path. — US5.
- **FR-016**: Enrollment of new purchases (Q16, C-09): `@OnEvent('CommercialCycleStarted')` (payload `purchaseId` = purchase uuid, emitted by 016 after commit) → load the purchase, then for each `ACTIVE` campaign of its organization: skip when the purchase is not in the segment, when a newer qualifying purchase of the same customer exists, when automations for that campaign/purchase already exist (idempotent), or when the campaign would exceed `MAX_AUTOMATIONS_PER_CAMPAIGN`; otherwise generate the campaign's stages for that purchase with `reference = max(startAt, now)` inside one transaction. Never cancels automations of other purchases. Errors are logged, never propagated to the emitter (NR-008). — US5/US6.

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` from JWT only on REST (API_GUIDELINES §18); cross-tenant → 404.
- **NR-002**: Envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-003**: No N+1: list/detail stats via `groupBy` on automations (single query); segment resolution single query (dedupe in memory).
- **NR-004**: Transactional invariants: activate (status guard + segment + automation creation) atomic (FR-006); cancel (status guard + automation cancel) atomic.
- **NR-005**: Concurrency-safe transitions: single-row status-guarded updates; concurrent activate/cancel/resume → 400 `VALIDATION_ERROR` (already transitioned), never double-generation.
- **NR-006**: Idempotent event/state consumption (07:375-379) — finish detection and event consumers.
- **NR-007**: Audit never-throw (AuditIdentityService pattern).
- **NR-008**: Controlled exceptions only; never leak internal errors (Constitution IX).
- **NR-009**: No secrets, credentials, message template content or other PII in logs; events/audit carry ids/counts only (Constitution IX).
- **NR-010**: Date-only filters whole-day inclusive (precedent NR-010 of 016/017/018).

## 6. Acceptance Scenarios

- **AS-001**: Create campaign as DRAFT with full config → 201, `CampaignCreated` emitted, audit row (US1, FR-001, FR-013).
- **AS-002**: List campaigns with `status`/`type`/`search` filters → tenant-scoped rows with automation stats (US2, FR-002, NR-003).
- **AS-003**: Detail returns config + segment + stats; cross-tenant → 404 `CAMPAIGN_NOT_FOUND` (US2, FR-003, Q11).
- **AS-004**: Update only DRAFT; updating ACTIVE → 400 `VALIDATION_ERROR`; `CampaignUpdated` + audit (US3, FR-004).
- **AS-005**: Segment preview returns the qualifying count without creating automations (US4, FR-005).
- **AS-006**: Activate → guarded DRAFT→ACTIVE, N automations created (one per customer, most recent purchase), `scheduledDate` = max(startAt, now), `CampaignActivated` with count, audit (US5, FR-006, Q6/Q7).
- **AS-007**: Activate with segment > `MAX_AUTOMATIONS_PER_CAMPAIGN` → 400 `SEGMENT_TOO_LARGE`, no automations created, campaign stays DRAFT (US5, FR-006, Q8).
- **AS-008**: Concurrent second activate → 400, no duplicate automations (NR-005).
- **AS-009**: Pause ACTIVE → PAUSED; scheduler stops sending its automations; resume → ACTIVE (US6, FR-007/008, Q10).
- **AS-010**: Cancel ACTIVE/PAUSED/DRAFT → CANCELLED; pending SCHEDULED automations → CANCELLED; terminal (no resume); `CampaignCancelled` + audit (US7, FR-009, Q10).
- **AS-011**: When the last SCHEDULED automation of a campaign executes, the campaign transitions ACTIVE → FINISHED, `CampaignFinished` emitted, audit (US8, FR-010).
- **AS-012**: Campaign automation execution uses the campaign template content with placeholders replaced (US5, FR-012).
- **AS-013**: Campaign automation is skipped by the scheduler while the campaign is PAUSED/CANCELLED/FINISHED (FR-012, Q10).
- **AS-014**: All campaign actions audited; audit failure never breaks the flow (FR-013, NR-007).
- **AS-015**: Activate a campaign whose purchase expires in 30 days and whose stages are `PURCHASE_DATE +2`, `+60`, `WARRANTY_EXPIRY -10`, `+5` → only `+2`, `-10` and `+5` are generated; the `+60` review (after the expiry) is skipped (FR-015). The same purchase without `warrantyExpiresAt` generates all purchase-anchored stages.
- **AS-016**: After activation, a new purchase creates its cycle (016) → `CommercialCycleStarted` → the campaigns module creates the ACTIVE campaign's stages for that purchase (and only that purchase), leaving the automations of the customer's previous purchases untouched; replaying the event creates nothing (FR-016).

## 7. Out of Scope (v1)

- AU-010 (max 1 campaign per configurable company period, priority-based rescheduling) — HG-4 → Módulo 10 Configuración (no window validation, no hardcoded period).
- Real message templates/plantillas (provider-side) — HG-2 / 017 HG-7 (`03:271-275` CA-001) → Módulo 10 Configuración.
- AU-009 (business hours) — HG-9 → Módulo 10 Configuración.
- Predefined segment presets (Clientes nuevos/frecuentes/inactivos/pendientes de recompra, `02-modules.md:181-187`) — the HG-7 free-filter approach covers them; presets → future.
- Campaign statistics/reporting (Módulo 06 "Estadísticas") — Módulo 08 Reportes.
- WhatsApp SOCIAL / multi-channel; retries of FAILED campaign messages.
- Dashboard consumers of Campaign*/Automation* events — kit 020 (HG-9).
- Deleting campaigns; editing segment/template/type after activation (only DRAFT editable, FR-004).

## 8. Known Conflicts (resolved via HG)

- **C-01** ("Programada" state): Flujo 08/`02-modules.md` use "Programada"; enum `CampaignStatus` has no `SCHEDULED`. → **HG-5**: ACTIVE with future `startAt` = "Programada"; no enum change.
- **C-02** (plantillas): CA-001 requires "plantillas previamente configuradas" but no Template entity exists (Módulo 10 Configuración). → **HG-2**: `Campaign.template` = free text message; no Template entity; real templates deferred.
- **C-03** (AU-010 window): "máx 1 por período configurable por empresa" needs Configuración (deferred). → **HG-4**: no window validation in v1, no hardcoded period; Configuración becomes source of truth later.
- **C-04** (`Automation.purchaseId` NOT NULL): campaigns on customers without purchases impossible without a schema change. → **HG-6**: v1 targets only customers with purchases; `purchaseId` stays NOT NULL.
- **C-05** (segment location): spec Campaign table (`06-database.md:174-187`) lists no segment fields; Módulo 06 lists "Segmentación". → **R-006 (research)**: `segment` JSON column on the campaign (reusable config, `04-domain-model.md:117`), DTO-validated.
- **C-06** (per-customer vs per-purchase): a customer with several purchases could receive one automation per purchase (AU-010 spirit). → **HG-6/design**: one automation per customer (most recent qualifying purchase).
- **C-07** (pause semantics): spec defines no pause behavior. → **HG-5/design**: pause is campaign-level; automations stay SCHEDULED but the scheduler skips non-ACTIVE campaigns; resume reactivates.
- **C-08** (campaign type semantics): `CampaignType` values have no rules. → **design**: informational metadata in v1; behavior deferred.
- **C-09** (purchases created after activation): activation only enrolls purchases that exist at that moment (FR-006), so a later purchase would never receive the lifecycle stages of an `ACTIVE` campaign. → **Human decision (2026-09-27)**: the module consumes `CommercialCycleStarted` (016, after commit) and enrolls the new purchase (FR-016) under the same per-customer rule (C-06) and idempotency (AU-011); other purchases are never cancelled (016 C-06).
- **C-10** (stages beyond the warranty): recurring reviews expressed as fixed offsets (+60, +120, …) would fall after `warrantyExpiresAt` on shorter warranties, sending "review to keep your warranty valid" messages once the warranty is over. → **Human decision (2026-09-27)**: no recurrence concept is added to the model; instead each purchase's own `warrantyExpiresAt` bounds the purchase-anchored stages (FR-015/Q15).

## 9. Dependency Justification (AGENTS.md)

- **No new runtime dependencies**: activation creates `SCHEDULED` automations consumed by the existing whatsapp scheduler (kit 017); no SDK, no new packages.
- `@nestjs/event-emitter` (installed): emit campaign events (07:200-210) and consume `AutomationExecuted` (07:195) for finish detection.
- Env vars: **none new**; `MAX_AUTOMATIONS_PER_CAMPAIGN` and `CAMPAIGN_BATCH_SIZE` are module constants (not env) in v1 — no secrets introduced.
- Additive whatsapp change: `executeDueAutomations` where-clause (campaign must be ACTIVE) + include `campaign.template` + content resolution (FR-012) — no behavioral change to 016/017 cycle automations.
- `CampaignsModule` registers in `AppModule`; no other module imports it (self-contained).

## 10. Role and Tenant Notes

- All campaign endpoints: **all authenticated organization roles** (HG-3) — JwtAuthGuard only, no `@Roles` restriction.
- `TenantScopeGuard` MUST NOT be used (precedent R-005 of 017); tenant enforcement in the service layer (`findScoped` pattern). Cross-tenant → 404 `CAMPAIGN_NOT_FOUND`, never disclosure.
- Segments are resolved against the campaign's organization only; `productId`/`customerStatus` filters are org-scoped via the purchase/customer query.
- Events/audit carry ids and counts only (never template content, NR-009).