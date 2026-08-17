# Automatizaciones v1 — Tasks

## Phase 0 — Research & gates (done)

- T137: Kit 016-automations-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-5 approved 2026-08-15.

## Phase 1 — Persistence (migration)

- [x] T138: Prisma schema delta (model CommercialCycle: `createdBy`, `updatedBy`, `deletedBy`; model Automation: `createdBy`, `updatedBy`, `deletedBy`, `@@index([organizationId, status])`). No enum changes (R-002).
- [x] T139: Generate migration (`20260815184029_add_automations_v1_fields`), SQL reviewed per data-model.md, applied, `prisma migrate status` + typegen verified.

## Phase 2 — Domain (automations module)

- [x] T140: `dto/query-commercial-cycles.dto.ts`, `dto/query-automations.dto.ts`, `dto/automation-path-params.dto.ts` (class-validator; pagination/filters/sort whitelist per contracts).
- [x] T141: `automations.events.ts` — envelope + builders (CommercialCycleStarted, AutomationCreated, AutomationCancelled, CommercialCycleCancelled with traceability payload per 07:383-395).
- [x] T142: `automations.service.ts`: `onPurchaseImported` consumer (`@OnEvent('PurchaseImported')`) — idempotent (R-008), load purchase, AU-003 detection (R-009), transactional create/replace cycle + 3 automations with cadence (R-010, HG-5); `listCycles`/`getCycle` (tenant via purchase, R-005), `listAutomations`/`getAutomation` (own organizationId); `cancelAutomation` (status-guarded PENDING/SCHEDULED → CANCELLED, AU-004); audit hooks (never-throw); cycle/automation events.
- [x] T143: `automations.controller.ts` (GET /commercial-cycles, GET /commercial-cycles/{uuid}, GET /automations, GET /automations/{uuid}, POST /automations/{uuid}/cancel; `@Roles` cancel PO+ADMIN+GERENTE, reads all; no manual create endpoints, FR-014); `AutomationsModule` registered in AppModule.

## Phase 3 — Tests

- [x] T144: Unit `automations.service.spec.ts` — onPurchaseImported create (AU-001), idempotent replay, AU-003 re-purchase cancel+recreate, cadence dates, list/get scoping + 404, cancel transitions (AS-001..AS-003, AS-006..AS-008, AS-013). 25 cases green.
- [x] T145: Unit `automations.controller.spec.ts` — roles (cancel PO+ADMIN+GERENTE), envelope (AS-009, AS-010).
- [x] T146: e2e `automations.e2e-spec.ts` — import purchase → cycle+3 automations (AS-001), replay no-op (AS-002), re-purchase (AS-003), list/detail filters (AS-004/005), cancel 200/400 (AS-006/007), cross-tenant 404 (AS-008), roles (AS-009), audit rows (AS-011), events (AS-012). 10 cases green. `imports.e2e-spec.ts` cleanup extended for the new consumer FK dependency (automations/commercial_cycle rows).

## Phase 4 — OpenAPI

- [x] T147: `specs/api/components/schemas/Automation/` (Automation, AutomationSummary, AutomationDetails, AutomationListResponse, AutomationResponse, CancelAutomationResponse) + `specs/api/components/schemas/CommercialCycle/` (CommercialCycleSummary, CommercialCycleDetails, CommercialCycleListResponse, CommercialCycleResponse) + `specs/api/paths/automations.yaml` (5 endpoints) wired into root `specs/api/openapi.yaml` with `~1`-escaped `$ref`; `npm run api:validate` (redocly + spectral on bundle) green.

## Phase 5 — Gates & delivery

- [x] T148: Lint/typecheck/format; `nest build`; unit 248/248 + e2e 108/108 + combined 356/356; coverage all files 94.32%, automations module 96.29% stmts.
- [x] T149: Update spec checklist (checklists/requirements.md → done/notes); review diff (no unrelated files, no secrets); Conventional Commit `feat(automations): implement automations v1` (no push unless requested).

## Phase 6 — Post-commit review (2026-08-15)

- [x] T150: Full module review — spec vs implementation, tenancy, events, DTOs, migration, tests. Fixed: OpenAPI enums (FINISHED/ERROR/PAUSED, were COMPLETED/PROCESSING/FAILED); contract `customer.fullName` → `customer.name`; contract sort whitelists aligned. All gates re-verified (unit 248/248, e2e 108/108, lint, tsc, build, api:validate).
- [x] T151: AU-003 emits `AutomationCancelled` per cancelled automation (HG-6, C-05): consumer fetches cancellable automations in the transaction and emits after commit; unit + e2e assertions added. Verified green.

## Out of scope (explicit)

Execution/message sending (HG-1), scheduler/BullMQ (HG-2), AU-006/007/009 (HG-3), AU-010 (HG-4), campaigns, dashboard consumers, manual create endpoints (FR-014), SDK generation (R-012).