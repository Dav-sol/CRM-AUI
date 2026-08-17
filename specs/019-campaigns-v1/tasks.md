# Campaigns v1 — Tasks

## Phase 0 — Research & gates (pending approval)

- [ ] T183: Kit 019-campaigns-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-9 approved 2026-08-17 (plan.md Constitution Check PASS).

## Phase 1 — Persistence (migration)

- [ ] T184: Prisma delta (per data-model.md): add two new additive columns on `campaigns`: `startAt DateTime?` (@map "start_at"), `segment Json?` (@map "segment"), no enum/column changes beyond (HG-2, HG-5, R-011).
- [ ] T185: Generate migration (`add_campaigns_v1`), SQL reviewed per data-model.md (two additive columns, JSONB, nullable, no existing rows affected), applied, `prisma migrate status` + typegen verified.

## Phase 2 — Domain (campaigns module)

- [ ] T186: DTOs (`dto/`): `create-campaign.dto.ts`, `update-campaign.dto.ts`, `query-campaigns.dto.ts`, `campaign-path-params.dto.ts`, `activate-campaign.dto.ts`, `pause-campaign.dto.ts`, `resume-campaign.dto.ts`, `cancel-campaign.dto.ts`, `preview-segment.dto.ts`, `campaign-segment.dto.ts`. Validation: nested segment DTO with @ValidateNested + @Type; at least one of city/productId/purchaseFrom/purchaseTo/customerStatus required; dates ISO; class-validator decorators per API_GUIDELINES §23.
- [ ] T187: `campaigns.events.ts` (envelope + builders, module `campaigns`) for `CampaignCreated`, `CampaignUpdated`, `CampaignActivated`, `CampaignFinished`, `CampaignCancelled` (07:200-210) with traceability payloads (07:383-395); payloads: eventId, occurredAt, userId, organizationId, module, state, payload; pause emits CampaignUpdated; resume emits CampaignActivated.
- [ ] T188: `campaigns.service.ts`:
  - List/get campaign (extend read: preload segment, automationCount/executedCount via groupBy, no N+1, NR-003).
  - `create()`: DTO validated; emit CampaignCreated + audit; guard @map("organizationId") from JWT.
  - `update()`: only DRAFT; guard status; emit CampaignUpdated + audit.
  - `activate()`: guarded DRAFT→ACTIVE + segment resolution + count limit MAX_AUTOMATIONS_PER_CAMPAIGN (constant 5.000) + SEGMENT_TOO_LARGE 400; batch-create automations (500/batch) in one transaction (NR-005); scheduledDate = max(startAt, now); status = SCHEDULED; priority = 0; emit CampaignActivated + audit + campaign.automations.generated.
  - `pause()`: guarded ACTIVE→PAUSED; emit CampaignUpdated + audit.
  - `resume()`: guarded PAUSED→ACTIVE; emit CampaignActivated + audit.
  - `cancel()`: guarded from DRAFT/ACTIVE/PAUSED→CANCELLED; cancel pending SCHEDULED automations (updateMany); emit CampaignCancelled + audit.
  - `previewSegment()`: resolve segment (AND combinator); return {count} qualifying customers; no automations created; audit.
  - `@OnEvent('AutomationExecuted')` consumer: look up automation by payload.automationId; if campaignId, count remaining SCHEDULED automations of the campaign; zero → guarded ACTIVE→FINISHED, emit CampaignFinished, audit campaign.finish; idempotent (guarded update).
  - `export` CampaignModule registered in AppModule; subscribes to AutomationExecuted via @OnEvent; uses PrismaService; injects AuditIdentityService.
  - All endpoints JwtAuthGuard only (no @Roles → all authenticated org roles, HG-3).
  - Reads tenant-scoped via organizationId from JWT; cross-tenant → 404 CAMPAIGN_NOT_FOUND (precedent R-005).
  - Whatsapp integration: scheduler where-clause additive filter (campaign must be ACTIVE) + include campaign.template + content resolution (campaign template placeholders vs AUTOMATIC_TEMPLATE fallback) — see whatsapp.service.ts changes (T19x).
- [ ] T189-190: unit + e2e specs.
  - Unit `campaigns.service.spec.ts`: create (US1), list/detail (US2), update DRAFT (US3), activate with segment & count limit (US4/US5/AS-001..007), pause/resume/cancel (US6/US7/AS-009..011), finish detection (AS-011/AS-012), audit rows (AS-013), segment preview (AS-005), idempotency (AS-014). ~40-50 cases.
  - Unit `campaigns.controller.spec.ts`: role matrix per HG (AS-006/009/011), envelope (NR-002), DRAFT-only update guards (AS-004), segment preview flow (AS-005).
  - e2e `campaigns.e2e-spec.ts`: C1-C9 scenarios (quickstart); create+bandeja-list (AS-001/AS-002); segment preview (AS-005); activate with over-limit → SEGMENT_TOO_LARGE (AS-007); concurrent activate → 400 (AS-008); pause/resume (AS-009/AS-010); auto-finish after last automation executes (AS-011/AS-012); audit rows (AS-013); all with coverage report.
- [ ] T191: OpenAPI (`specs/api/paths/campaigns.yaml` + schemas + root refs) + `info/tags.yaml` tag `Campaigns` already present; fill paths: create/list/detail/update/activate/pause/resume/cancel/preview-segment; schemas Campaign/CampaignSummary/CampaignDetails/CampaignListResponse/CampaignResponse/CreateCampaignRequest/UpdateCampaignRequest/CampaignSegment/SegmentPreviewResponse; `npm run api:validate` green.
- [ ] T192: lint/typecheck/build; unit + e2e suites green; coverage target >80% (campaigns module); no side effects in other suites.

## Phase 4 — Gates & delivery

- [ ] T193: checklist + review diff (no unrelated files, no secrets); Conventional Commit `feat(campaigns): implement campaigns v1` (no push salvo orden).

## Out of scope (explicit)

AU-010 (window/priority policy → Configuración HG-4), plantillas reales (HG-2/017 HG-7 → Configuración), AU-009 business hours, predefined segment presets, statistics/reporting (→ Módulo 08), WhatsApp SOCIAL, retries, dashboard consumers (HG-9 → kit 020).