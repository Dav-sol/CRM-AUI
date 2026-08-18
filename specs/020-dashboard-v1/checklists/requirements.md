# Checklist: Dashboard v1 (checklists/requirements.md)

> Estado: implementación completa (docs + service/controller/module + tests + OpenAPI) + gates verificados.
> Pendientes: commit/push (salvo orden).

## CR-01: Spec & gates
- [x] Plan Constitution Check PASS; HG-1 (on-the-fly, sin tablas ni consumidores), HG-2 (3 endpoints), HG-3 (semánticas KPI) aprobados 2026-08-18 y registrados en spec.md (Q&A).
- [x] spec.md/plan.md/contracts/quickstart/tasks completos y consistentes con la implementación final.

## CR-02: Data model
- [x] data-model.md: **zero schema changes** — sin migración, sin nuevos índices (los existentes cubren todos los paths).
- [x] `prisma migrate status` OK (sin cambios de esquema; verificado 2026-08-18).

## CR-03: Service (dashboard.service.ts)
- [x] `summary()`: 9 counts org-scoped en paralelo con semánticas HG-3 y `deletedAt: null` (customers.total/newThisMonth, purchases.total/thisMonth, automations.scheduled, messages.sent/pending, conversations.open, campaigns.active).
- [x] `campaigns()`: `recent` (createdAt desc, take 10) + `upcoming` (ACTIVE + startAt > now, asc, take 10).
- [x] `activity()`: últimos 20 Audit de la org (createdAt desc) con `userName` compuesto (firstName + lastName).
- [x] Sin writes, sin eventos, sin audit writes (FR-005); org solo del JWT (NR-001); usuarios PLATFORM (sin org) → ceros/vacíos sin tocar la DB.

## CR-04: Controller & module
- [x] `dashboard.controller.ts`: 3 GET bajo `/dashboard`, `@UseGuards(JwtAuthGuard)` en clase sin `@Roles` (todos los roles de org, precedente 018/019).
- [x] `dashboard.module.ts` registrado en `app.module.ts` (PrismaModule + AuthModule).
- [x] Envelope `{ data }`; errores controlados (401 por guard global).

## CR-05: OpenAPI
- [x] `paths/dashboard.yaml` (3 endpoints) + schemas: Dashboard (DashboardSummary), DashboardResponse, DashboardCampaign, DashboardCampaignsResponse, DashboardActivityItem, DashboardActivityResponse.
- [x] Stubs vacíos no aplicables eliminados (CreateDashboardRequest, UpdateDashboardRequest, DashboardDetails, DashboardListResponse, DashboardSummary); wiring en `openapi.yaml` (3 paths); tag `Dashboard` ya registrado.
- [x] `npm run api:validate` green (solo warning pre-existente no-server-example-com).

## CR-06: Tests
- [x] Unit `dashboard.service.spec.ts` (KPIs + límite de mes UTC + exclusión soft-delete + org-scope + paralelismo + orden/límites de campañas y actividad + usuarios PLATFORM; 12 casos).
- [x] Unit `dashboard.controller.spec.ts` (3 endpoints, guard JwtAuthGuard sin ROLES_KEY, envelope; 4 casos).
- [x] e2e `dashboard.e2e-spec.ts` (D1-D6: KPIs vs seeds, campañas recientes/próximas, actividad con nombres, aislamiento cross-org, 401, rol OPERADOR 200; 6 casos).
- [x] Cobertura dashboard module: service 100% lines / 91.66% branch; controller 100% (target >80% OK).
- [x] Suites completas verdes: unit 429/429 (34 suites) + e2e 150/150 (14 suites), sin side-effects.

## CR-07: Gates
- [x] `tsc --noEmit` 0 errores; eslint 0 errores; prettier aplicado.
- [x] `npm run build` OK.
- [ ] Diff revisado (sin archivos no relacionados, sin secrets); Conventional Commit `feat(dashboard): implement dashboard v1`; push salvo orden.