# Dashboard v1 — Research

## R-001: Read model architecture (on-the-fly vs denormalized counters)

**Context**: `07-event-architecture.md` lists "Actualizar Dashboard" as an async consumer side-effect of `PurchaseImported` (270), `AutomationExecuted` (279), `MessageReceived` (292), `ImportCompleted` (310) and defines a `DashboardUpdated` event (106). However `06-database.md` has **no Dashboard section** (no tables), and kits 016/017/018/019 each deferred "dashboard consumers" / "dashboard/KPI endpoints" to kit 020.

**Options**:
- (A) **On-the-fly aggregates** (chosen, HG-1): each KPI is a `count` over an org-scoped, indexed path (customers/purchases/automations/messages/conversations/campaigns/audits); campaigns/activity are `findMany` with `take`. Always consistent with committed data; zero schema; zero coupling to the write path; no desync risk. Cost: recomputation per request — acceptable at v1 scale (per-tenant row counts in the low thousands; all paths indexed).
- (B) Denormalized counters: a `dashboard_metrics` table updated by consumers in imports/whatsapp/campaigns/conversations. Pros: O(1) reads, real-time feeds later. Cons: new table + ~5 consumers across 4 closed modules + eventual-consistency/desync handling + backfill for existing data. Specs give no model, no retention, no reset rules.

**Decision**: (A) for v1 (HG-1). (B) remains the documented future path if latency/volume ever requires it (a future kit would then add the table + consumers + backfill).

**References**: `07-event-architecture.md:106,270,279,292,310,353`; `06-database.md` (no dashboard model); deferrals in `016 tasks.md:41`, `017 plan.md:41`, `018 tasks.md:43`, `019 plan.md:9,42,63`; HG-1 approved 2026-08-18.

## R-002: KPI semantics (enum values + calendar boundaries)

**Context**: `02-modules.md:30-59` lists indicators without definitions ("Mensajes pendientes", "Conversaciones abiertas", "Compras del mes", "Clientes nuevos", "Próximas campañas").

**Decision** (HG-3, documented in spec.md Q3):
- Mensajes pendientes = `MessageStatus.QUEUED` (queued, not yet sent; `SENT/DELIVERED/READ` are progressed states, `FAILED` is terminal).
- Mensajes enviados = `MessageStatus.SENT` (exact state; DELIVERED/READ imply SENT but the spec's term maps to the literal state).
- Conversaciones abiertas = `ConversationStatus.OPEN` (`CLOSED/ARCHIVED` excluded).
- Clientes nuevos = `Customer.createdAt` in the current calendar month (registration time, the only creation timestamp on Customer).
- Compras del mes = `Purchase.purchaseDate` in the current calendar month (the commercial date of the sale — invoice context; NOT `createdAt`, which is the import time).
- Automatizaciones programadas = `AutomationStatus.SCHEDULED`.
- Campañas activas = `CampaignStatus.ACTIVE`.
- Próximas campañas = `ACTIVE` + `startAt > now`, ordered `startAt` asc (HG-5 semantics of 019: "Programada" = ACTIVE with future startAt).
- Campañas recientes = `createdAt` desc.
- Month boundary = UTC calendar month (`now` truncated to first day of month, UTC) — consistent with ISO 8601 UTC convention (API_GUIDELINES §20-21).

**References**: `schema.prisma` enums (`MessageStatus` 610-618, `ConversationStatus` 592-596, `AutomationStatus` 578-586, `CampaignStatus`), `019 spec.md` Q4 (HG-5).

## R-003: Activity feed source

**Context**: "Actividad del sistema" (`02-modules.md:59`) is a dashboard item; no dedicated activity table exists.

**Decision**: Read the existing `Audit` table (`schema.prisma:488-511`, written by `AuditIdentityService` in every module) — last 20 rows org-scoped, `createdAt` desc, with `user.firstName/lastName` via a single `include`. Read-only; no audit write on dashboard reads (would pollute the trail). Never expose `metadata` content that could carry PII — the v1 feed returns the stored `description`/`metadata` verbatim as written by the source modules (their contracts already forbid PII), plus no message content ever.

**References**: `schema.prisma:488-511`; `specs/09-development-standards.md` (audit pattern); Constitution IX (no PII exposure).

## R-004: Endpoint granularity

**Context**: Flujo 09 (231-247) describes a single dashboard screen; no endpoint list exists anywhere in the specs.

**Decision** (HG-2): three endpoints — `summary` (all KPIs), `campaigns` (recent + upcoming), `activity` (last audit entries). Rationale: a single mega-endpoint would force re-fetching the whole payload on any panel refresh and produce large nested schemas; per-KPI endpoints would multiply calls for a one-screen module. Three maps 1:1 to the three dashboard panels.

**References**: `05-user-flows.md:231-247`; HG-2 approved 2026-08-18.