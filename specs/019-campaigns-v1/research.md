# Campaigns v1 — Research Notes

## R-001 — Foundation (state)

The `automations` module (016) owns the `CommercialCycle`/`Automation` lifecycle and creates `SCHEDULED` automations per purchase (`createCycleFromPurchase`, `automations.service.ts:240-359`). The `whatsapp` module (017) owns `WhatsAppProvider`, the in-process scheduler (`WhatsappScheduler` `@Interval(60_000)`, `whatsapp.scheduler.ts`), and `executeDueAutomations` (`whatsapp.service.ts:174-216`) which executes `SCHEDULED` automations whose date is due and whose customer is ACTIVE, creating `type=AUTOMATIC` OUTBOUND messages and emitting `MessageQueued/Sent/Failed` + `AutomationExecuted/Failed` (`whatsapp.service.ts:277,334,356`). The `Campaign` model (`schema.prisma:197-215`) and `Automation.campaignId`/`priority` already exist (migration `add_domain_entities`) but are unused. Campaigns v1 makes the campaign aggregate operational.

## R-002 — Segment storage (design INFERENCIA, HG-7)

The spec's Campaign table (`06-database.md:174-187`) lists no segment fields, but Módulo 06 lists "Segmentación" (`02-modules.md:176`) and the campaign is "Configuración reutilizable" (`04-domain-model.md:117`). Decision: a **`segment` JSON column** on `campaigns` storing `{ city?, productId?, purchaseFrom?, purchaseTo?, customerStatus? }` (≥1 criterion, HG-7). Rationale: (a) segment is part of the campaign definition, (b) consumed only at activation/preview in v1 (no query/join needs, no index required), (c) validated by class-validator at the API boundary, (d) one additive column vs a new table + relation. Future reporting (Módulo 08) can evolve to a normalized model. **INFERENCIA** (not prescribed by specs).

## R-003 — Lifecycle & states (HG-5)

Approved: no `SCHEDULED` enum value. `DRAFT` (created) → `ACTIVE` (activation; future `startAt` = "Programada") → `PAUSED` ↔ `ACTIVE`; `ACTIVE/PAUSED` → `FINISHED` (auto) or `CANCELLED` (terminal). Pause is campaign-level metadata: automations stay `SCHEDULED`, the scheduler where-clause excludes campaigns ≠ `ACTIVE` (R-008). This is reversible (resume) and keeps data intact (CO-003 spirit). Cancel is terminal: it also cancels pending automations (AU-011 spirit — no orphan scheduled sends).

## R-004 — Activation & bulk generation (HG-6, HG-8)

Activation resolves the segment against purchases of the organization: `purchaseDate` range, product by relation `uuid`, customer `city` (case-insensitive contains, consistent with `customers.service.ts:249-250`) and `customerStatus`; **one automation per customer** (dedupe by `customerId`, keeping the most recent qualifying purchase) so a customer never receives multiple campaign messages (AU-010 spirit, C-06). `scheduledDate = max(campaign.startAt, now)`, `status = SCHEDULED`, `priority = 0`. Guarded `DRAFT → ACTIVE` (single-row update, NR-005 precedent) + automation creation in **one transaction** (any failure rolls back → campaign stays DRAFT; concurrent activation → 400). Bulk: `MAX_AUTOMATIONS_PER_CAMPAIGN` (default 5.000) + `CAMPAIGN_BATCH_SIZE` (default 500) as module constants; over limit → `400 SEGMENT_TOO_LARGE` (no partial creation). Batch-failure logging per NR-008 (no PII).

## R-005 — Finish detection (event-driven, 07:195/200-210)

The campaigns module subscribes via `@OnEvent('AutomationExecuted')` (whatsapp envelope, `whatsapp.service.ts:334`). Consumer: look up the automation by `payload.automationId`; if `campaignId` is null → return (cycle automations unaffected). Otherwise count remaining `SCHEDULED` automations of the campaign; when zero → guarded `ACTIVE → FINISHED`, emit `CampaignFinished`, audit `campaign.finish`. Idempotent (guarded update; already-FINISHED → no-op). Message-level failures (provider errors) leave the automation `EXECUTED` — the campaign still finishes (retries deferred).

## R-006 — WhatsApp execution integration (additive, FR-012)

Two additive changes to `whatsapp.service.ts`, no behavioral change to 016/017 automations:
1. `executeDueAutomations` where-clause gains `OR: [{ campaignId: null }, { campaign: { status: 'ACTIVE' } }]` → paused/cancelled/finished campaigns stop sending.
2. The query includes `campaign: { select: { template: true } }`; `executeOneAutomation`/`buildAutomaticContent` resolve content from `automation.campaign?.template` (with `{customerName}`/`{productName}`/`{organizationName}` replacement) falling back to `AUTOMATIC_TEMPLATE`.
Existing `whatsapp.service.spec.ts` mocks the query where/include — additive updates required (see T19x).

## R-007 — Campaign type (C-08)

`CampaignType` (AUTOMATIC/MANUAL/REPURCHASE/SPECIAL) has no rules in the specs; it is **informational metadata** in v1 (required at creation, no behavioral difference). Future engines (Configuración, Reportes) may attach semantics. **INFERENCIA**.

## R-008 — Scheduler interaction (paused campaigns)

`executeDueAutomations` currently filters `status: 'SCHEDULED', scheduledDate ≤ now, purchase valid, customer ACTIVE`. Adding the campaign-ACTIVE filter (R-006) means a PAUSED campaign's due automations are simply skipped each tick — no data mutation, reversible on resume. AU-011 (never execute twice) already holds via the guarded `SCHEDULED → EXECUTED` update in `executeOneAutomation`.

## R-009 — Data model delta (HG-5/HG-7)

Additive only (precedent R-013 of 017, R-011 of 018):
- `Campaign.startAt DateTime?` (`@map("start_at")`) — the send date; "Programada" = ACTIVE with future `startAt` (HG-5).
- `Campaign.segment Json?` (`@map("segment")`) — `{ city?, productId?, purchaseFrom?, purchaseTo?, customerStatus? }`, ≥1 criterion (HG-7, R-002).
- No enum changes; no destructive transformations; no backfills.

## R-010 — Migration caution (precedent R-014 of 017)

Generate via `npx prisma migrate dev --create-only --name add_campaigns_v1`, review SQL (two additive columns with a JSON default), apply. No existing rows affected (`start_at`/`segment` nullable).

## R-011 — Test infrastructure (state)

Unit 375/375; e2e 133/133 (conversations closure 2026-08-17). New suites: `campaigns.service.spec.ts`, `campaigns.controller.spec.ts`, `campaigns.e2e-spec.ts`; `whatsapp.service.spec.ts` extended additively for the campaign-content/pause-filter paths. Coverage target >80% per module (Constitution X).

## R-012 — OpenAPI scaffolds (state)

`specs/api/paths/campaigns.yaml` (empty) + `Campaign/*` schemas (7 empty) + tag `Campaigns` in `info/tags.yaml` already committed (from `e9642dd`). Kit 019 fills: paths (list/create/detail/update/activate/pause/resume/cancel/preview-segment), schemas `Campaign`, `CampaignSummary`, `CampaignDetails`, `CampaignListResponse`, `CampaignResponse`, `CreateCampaignRequest`, `UpdateCampaignRequest`, `CampaignSegment`, `SegmentPreviewResponse`; root refs in `openapi.yaml`; `npm run api:validate` green.

## R-013 — Events (07:200-210)

Emit after commit: `CampaignCreated` (campaignId, name, type, status DRAFT, createdAt), `CampaignUpdated` (campaignId, updatedBy, changedAt), `CampaignActivated` (campaignId, activatedBy, startedAt, automationCount, changedAt), `CampaignFinished` (campaignId, finishedAt), `CampaignCancelled` (campaignId, cancelledBy, changedAt). New `CampaignEventEnvelope` (`module: 'campaigns'`) mirroring the whatsapp/automations envelope (eventId, occurredAt, userId, organizationId, module, state, payload). Pause emits `CampaignUpdated`; resume emits `CampaignActivated`.

## R-014 — Audit (AD-001..003)

New actions via `AuditIdentityService` (never-throw): `campaign.create/.update/.activate/.pause/.resume/.cancel/.finish`, `campaign.preview_segment`, `campaign.automations.generated`. Never log template/segment content (PII-free rule, NR-009).

## R-015 — AU-010 deferral (HG-4)

No window/period validation, no hardcoded "max 1 campaign" in v1. `Automation.priority` is set (0) so future Configuración rules can layer on without data changes. The plan.md, spec.md and tasks.md all record the deferral explicitly.