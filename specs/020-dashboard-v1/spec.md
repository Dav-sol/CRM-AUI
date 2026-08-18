# Dashboard v1 — Feature Specification

## 1. Purpose

The Dashboard module (Módulo 01 Dashboard, `specs/02-modules.md:30-59`) presents the overall state of the operation in real time. It is the last pending v1 module of the roadmap (`02-modules.md:311-325`): v1 = Clientes, Compras, Importador, Automatizaciones, WhatsApp, Dashboard. Six previous kits (016/017/018/019) explicitly deferred "dashboard consumers of * events" and "dashboard/KPI endpoints" to this kit. The module is **read-only**: it aggregates the existing org-scoped tables (customers, purchases, automations, messages, conversations, campaigns, audits) into KPI values (Flujo 09, `05-user-flows.md:231-247`).

## 2. Clarifications (Q&A)

- **Q1: How are the KPIs computed?** → A1: **On-the-fly aggregate queries** (HG-1). Each KPI is a single `count` on an indexed org-scoped path, all executed in parallel (`Promise.all`); recent/upcoming campaigns and the activity feed are `findMany` with `take`. There are **no dashboard tables and no event consumers** in v1: `07-event-architecture.md` lists "Actualizar Dashboard" as an async consumer of `PurchaseImported`/`AutomationExecuted`/`MessageReceived`/`ImportCompleted` (270/279/292/310) and a `DashboardUpdated` event (106), but `06-database.md` defines **no dashboard data model**, and six kits deferred the consumers. Denormalized counters via event consumers are OUT (documented), see research.md R-001.
- **Q2: What endpoints does the dashboard expose?** → A2: Three (HG-2): `GET /dashboard/summary` (global KPIs), `GET /dashboard/campaigns` (recent + upcoming campaigns), `GET /dashboard/activity` (last audit entries of the organization). Flujo 09 is a single screen; granular endpoints keep schemas small and reusable.
- **Q3: What exactly do the ambiguous indicators mean?** → A3 (HG-3): "Mensajes pendientes" = `Message.status = QUEUED`; "Mensajes enviados" = `Message.status = SENT`; "Conversaciones abiertas" = `Conversation.status = OPEN`; "Clientes nuevos" = `Customer.createdAt` within the current calendar month; "Compras del mes" = `Purchase.purchaseDate` within the current calendar month (the commercial date, not `createdAt`); "Automatizaciones programadas" = `Automation.status = SCHEDULED`; "Campañas activas" = `Campaign.status = ACTIVE`; "Próximas campañas" = `ACTIVE` campaigns with `startAt > now`, ordered ascending by `startAt`; "Campañas recientes" = campaigns ordered by `createdAt` desc. All counts/listings respect `deletedAt: null` (CO-003).
- **Q4: What does the activity feed contain?** → A4: The last 20 `Audit` rows of the organization (`module`, `action`, `description`, `metadata`, `userId`, `createdAt`, plus the user's display name via `include`). It is a **read** of the existing audit trail (writes are owned by the source modules). Never includes message content or customer PII.
- **Q5: Who can read the dashboard?** → A5: **All authenticated organization roles** (ADMINISTRADOR, GERENTE, OPERADOR) — JwtAuthGuard only, no `@Roles` (precedent HG-3 of 018/019; Flujo 09 is the navigation hub for every role).
- **Q6: Tenant isolation?** → A6: `organizationId` from JWT only (API_GUIDELINES §18). Every query is org-scoped; the module never takes an org id from the client. Cross-tenant disclosure is impossible by construction. No org-existence validation needed (JWT guarantees an authenticated membership; a missing org yields zeros, never an error).
- **Q7: Does the dashboard write anything?** → A7: No. No writes, no events emitted, no audit writes, no new tables (HG-1). Read-only module.
- **Q8: Performance?** → A8: Each KPI is a single `count` on indexed paths (`[organizationId]`, `[organizationId, status]`, `[organizationId, createdAt]`, `[organizationId, purchaseDate]`, `[organizationId, createdAt]` on Audit). Recent/upcoming campaigns scan org-scoped campaigns only (small per-tenant sets at v1 scale). Parallel execution, no N+1. If scale ever demands it, denormalized counters become a future kit (research.md R-001).
- **Q9: Real-time?** → A9: No. The dashboard reflects the committed state at request time ("en tiempo real" = up-to-date on read, not push). Websockets/SSE and `DashboardUpdated` events are OUT (HG-1, research.md R-001).

## 3. User Stories

- **US1 (summary)**: As a user, I open the dashboard and see the global KPIs of my organization (customers registered + new this month, purchases imported + this month, scheduled automations, sent + pending messages, open conversations, active campaigns) (Flujo 09).
- **US2 (campaigns)**: As a user, I see the recent campaigns of my organization and the upcoming scheduled campaigns (Flujo 09: "Campañas").
- **US3 (activity)**: As a user, I see the latest system activity of my organization (Flujo 09: "Actividad del sistema", `02-modules.md:59`).
- **US4 (tenant isolation)**: Each user only ever sees their own organization's numbers.

## 4. Functional Requirements

- **FR-001**: `GET /dashboard/summary` — org-scoped KPIs, all `deletedAt: null`: `customers.total`, `customers.newThisMonth` (createdAt in current month), `purchases.total`, `purchases.thisMonth` (purchaseDate in current month), `automations.scheduled` (SCHEDULED), `messages.sent` (SENT), `messages.pending` (QUEUED), `conversations.open` (OPEN), `campaigns.active` (ACTIVE). Computed in parallel. — US1, Q3.
- **FR-002**: `GET /dashboard/campaigns` — `recent`: last 10 campaigns by `createdAt` desc; `upcoming`: ACTIVE campaigns with `startAt > now` ordered by `startAt` asc (take 10). Rows carry `uuid`, `name`, `type`, `status`, `startAt?`, `createdAt`. — US2, Q3.
- **FR-003**: `GET /dashboard/activity` — last 20 `Audit` rows of the org by `createdAt` desc: `uuid`, `module`, `action`, `description?`, `metadata?`, `userId?`, `userName?` (from `user.firstName` + `lastName`), `createdAt`. — US3, Q4.
- **FR-004**: Tenant isolation and soft-delete awareness on every query (Q6, Q3).
- **FR-005**: No writes, no events, no audit writes (Q7).

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` from JWT only (API_GUIDELINES §18); org-scoped queries by construction.
- **NR-002**: Envelope `{ data }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-003**: No N+1: 9 KPI counts in parallel; campaign rows without joins; activity single `findMany` + `include` user (one query).
- **NR-004**: Response time bounded: all queries indexed org-scoped paths; `take` limits 10/20.
- **NR-005**: Controlled exceptions only; never leak internal errors (Constitution IX).
- **NR-006**: No secrets; activity feed never exposes message content, customer PII or credentials (Constitution IX).

## 6. Acceptance Scenarios

- **AS-001**: `GET /dashboard/summary` returns all KPI groups with consistent counts against seeded org data; cross-org seed values never leak into another org's response (US1/US4, FR-001, Q6).
- **AS-002**: `GET /dashboard/campaigns` returns recent (createdAt desc) and upcoming (ACTIVE, startAt future, asc) subsets with take limits (US2, FR-002, Q3).
- **AS-003**: `GET /dashboard/activity` returns the last audit entries of the org with user names, most recent first (US3, FR-003).
- **AS-004**: Soft-deleted records are excluded from all counts and lists (FR-004, Q3).
- **AS-005**: Unauthenticated request → 401; any authenticated org role → 200 (Q5, NR-001).
- **AS-006**: The module performs no writes and emits no events (FR-005, Q7).

## 7. Out of Scope (v1)

- Denormalized dashboard counters / `DashboardUpdated` event consumers (`07-event-architecture.md:106,270,279,292,310`) — HG-1, research.md R-001.
- Real-time push (websockets/SSE); "en tiempo real" = up-to-date reads.
- IA predictiva, pronóstico de recompra, alertas inteligentes (`02-modules.md:58` "Futuras mejoras").
- Per-module drill-down reports and statistics (→ Módulo 08 Reportes; precedent "statistics/reporting → Reportes Módulo 08" of 019).
- Date-range filtering, export/CSV, custom dashboards, saved views.
- Activity feed pagination (v1 returns last 20 fixed).

## 8. Known Conflicts (resolved via HG)

- **C-01** (event consumers vs no data model): `07-event-architecture.md` mandates "Actualizar Dashboard" as an async consumer, but `06-database.md` defines no dashboard tables and six kits deferred the consumers. → **HG-1**: on-the-fly aggregate computation; consumers documented OUT. Research R-001 records the trade-off and the future path.
- **C-02** (contract shape): Flujo 09 is a single screen; no endpoint list is specified anywhere. → **HG-2**: three granular endpoints (summary/campaigns/activity).
- **C-03** (indicator semantics): "Mensajes pendientes", "Conversaciones abiertas", "Compras del mes", "Clientes nuevos", "Próximas campañas" have no formal definition. → **HG-3**: documented semantics per Q3 (enum values of the schema + calendar-month boundaries).

## 9. Dependency Justification (AGENTS.md)

- **No new runtime dependencies**: pure Prisma read queries; no event emitter usage; no SDKs.
- Env vars: **none new**.
- Existing modules untouched (read-only over their tables); only `AppModule` gains the `DashboardModule` registration and `openapi.yaml` gains the dashboard wiring.
- The module never imports another module's service; it uses PrismaService + AuthModule guard only.

## 10. Role and Tenant Notes

- All dashboard endpoints: **all authenticated organization roles** (HG-3 precedent) — JwtAuthGuard only.
- `TenantScopeGuard` MUST NOT be used (precedent R-005 of 017); tenant enforcement by construction (org id from JWT drives every query).
- Activity feed exposes `userId`/`userName` of the acting user (audit rows are already org-scoped); never message content or customer PII (NR-006).