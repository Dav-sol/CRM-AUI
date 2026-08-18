# Dashboard v1 — Tasks

## Phase 0 — Research & gates (pending approval)

- [x] T200: Kit 020-dashboard-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-3 approved 2026-08-18 (plan.md Constitution Check PASS).

## Phase 1 — Domain (dashboard module)

- [x] T201: `dashboard.service.ts`:
  - `summary()`: 9 org-scoped counts in parallel (`Promise.all`): customers.total / newThisMonth (createdAt >= UTC month start), purchases.total / thisMonth (purchaseDate >= UTC month start), automations.scheduled (SCHEDULED), messages.sent (SENT) / pending (QUEUED), conversations.open (OPEN), campaigns.active (ACTIVE). All `deletedAt: null` (HG-1/HG-3, data-model.md).
  - `campaigns()`: `recent` (createdAt desc, take 10) + `upcoming` (ACTIVE, startAt > now, startAt asc, take 10), rows as `CampaignRef` (uuid/name/type/status/startAt/createdAt).
  - `activity()`: last 20 `Audit` rows (org, createdAt desc, include user firstName/lastName) → `DashboardActivityItem[]` (uuid/module/action/description/metadata/userId/userName/createdAt).
  - All queries org-scoped from JWT user (organizationId); no writes/events/audit writes (FR-005).
- [x] T202: `dashboard.controller.ts` — 3 GET endpoints under `/dashboard` (`summary`, `campaigns`, `activity`); class-level `@UseGuards(JwtAuthGuard)` (no `@Roles` → all authenticated org roles, precedent 018/019 HG-3); envelope `{ data }`.
- [x] T203: `dashboard.module.ts` (imports: PrismaModule + AuthModule) + registration in `app.module.ts`.

## Phase 2 — Tests

- [x] T204: Unit `dashboard.service.spec.ts`: summary counts (each KPI + month boundaries + soft-delete exclusion), campaigns (recent ordering/limit, upcoming filter ACTIVE + startAt future + asc), activity (order, take 20, userName composition), org-scoping of every query; ~20-30 cases.
- [x] T205: Unit `dashboard.controller.spec.ts`: 3 endpoints route to service, envelope, JwtAuthGuard present (no ROLES_KEY metadata, role matrix precedent).
- [x] T206: e2e `dashboard.e2e-spec.ts`: D1-D5 scenarios — summary vs seeded org data (incl. soft-deleted row exclusion), campaigns panels, activity feed, cross-org isolation, 401 without token, OPERADOR role 200.

## Phase 3 — OpenAPI

- [x] T207: `specs/api/paths/dashboard.yaml` (3 endpoints) + schemas: `Dashboard`, `DashboardSummary`, `DashboardCampaign`, `DashboardCampaignsResponse`, `DashboardActivityItem`, `DashboardActivityResponse`, `DashboardResponse` — fill the 7 stub files under `specs/api/components/schemas/Dashboard/` + `Dashboard.yaml`; remove non-applicable empty stubs (`CreateDashboardRequest`, `UpdateDashboardRequest`, `DashboardDetails`, `DashboardListResponse`); wiring in `openapi.yaml` (`/dashboard` paths + `$ref` schema refs); tag already present (`info/tags.yaml`); `npm run api:validate` green.

## Phase 4 — Gates & delivery

- [x] T208: lint/typecheck/build; unit + e2e suites green; coverage target >80% (dashboard module); no side effects in other suites.
- [x] T209: checklist + review diff (no unrelated files, no secrets); Conventional Commit `feat(dashboard): implement dashboard v1` (no push salvo orden).

## Out of scope (explicit)

Denormalized counters / DashboardUpdated event consumers (HG-1, R-001), real-time push (websockets/SSE), IA predictiva / pronóstico de recompra / alertas inteligentes, per-module reports (→ Módulo 08 Reportes), date-range filtering, export/CSV, custom dashboards, activity pagination.