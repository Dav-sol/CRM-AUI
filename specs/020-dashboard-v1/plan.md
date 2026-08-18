# Implementation Plan: Dashboard v1

**Branch**: `main` | **Date**: 2026-08-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-dashboard-v1/spec.md`; domain requirements from `specs/01-mvp.md` (Dashboard en MVP 106-112; objetivo "Visualizar indicadores comerciales" 47), `specs/02-modules.md` (Módulo 01 Dashboard 30-59 — KPIs principales, clientes registrados, compras importadas, automatizaciones programadas, mensajes enviados, conversaciones activas, campañas recientes, actividad del sistema; indicadores: clientes nuevos, compras del mes, próximas campañas, mensajes pendientes, conversaciones abiertas), `specs/05-user-flows.md` (Flujo 09 — Dashboard 231-247), `specs/07-event-architecture.md` (DashboardUpdated 106; "Actualizar Dashboard" como consumidor de PurchaseImported 270, AutomationExecuted 279, MessageReceived 292, ImportCompleted 310; eventos asíncronos 353), `specs/06-database.md` (sin sección Dashboard — sin modelo de datos), deferrals de kits 016/017/018/019 (dashboard consumers + dashboard/KPI endpoints OUT → kit 020), approved decisions HG-1..HG-3 (kit 020, 2026-08-18)

## Summary

Dashboard v1 implements Módulo 01 Dashboard — the last pending v1 module — as a **read-only KPI surface** over the existing multi-tenant tables. Per HG-1 the KPIs are computed **on-the-fly** (aggregate `count`/`groupBy` queries against customers, purchases, automations, messages, conversations, campaigns and audits, all org-scoped via `organizationId` from JWT and soft-delete aware): no new tables, no event consumers. Per HG-2 the kit exposes three endpoints: `GET /dashboard/summary` (global KPIs), `GET /dashboard/campaigns` (recent + upcoming campaigns) and `GET /dashboard/activity` (last audit entries of the org). Per HG-3 the ambiguous indicators use the documented semantics (pending messages = QUEUED, sent = SENT, open conversations = OPEN, new customers = createdAt in current month, month purchases = purchaseDate in current month, scheduled automations = SCHEDULED, upcoming campaigns = ACTIVE with future `startAt`). The kit adds **no schema changes** (data-model.md = zero delta), no events, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL. **No new runtime dependencies**; no event consumption (HG-1); read-only Prisma queries only.

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). Existing models and indexes used as-is: `Customer` (90-119, `@@index([organizationId, createdAt])`, `@@index([organizationId, status])`), `Purchase` (144-175, `@@index([organizationId, purchaseDate])`), `Automation` (220-249, `@@index([organizationId, status])`), `Conversation` (252-277, `@@index([organizationId, status])`), `Message` (279-310, `@@index([organizationId, status])`), `Campaign` (197-218, `@@index([organizationId])`), `Audit` (488-511, `@@index([organizationId])`, `@@index([createdAt])`). **No delta** — data-model.md declares zero schema changes.

**Testing**: Jest + ts-jest (unit `*.spec.ts` under `src`; e2e via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: Every KPI query is a single `count` on an indexed org-scoped path; all queries run in parallel (`Promise.all`, no N+1); recent/upcoming campaigns and activity are `findMany` with `take` + `orderBy` on indexed paths. At v1 scale the org-scoped scans are cheap; documented in research.md (R-00x) — denormalized counters via event consumers are explicitly OUT (HG-1).

**Constraints**:
- Tenant isolation: `organizationId` from JWT only (API_GUIDELINES §18); every query is org-scoped; no cross-tenant disclosure possible by construction
- Roles: **all authenticated organization roles** may read the dashboard (Flujo 09 shows a navigation hub for every role; precedent HG-3 of 018/019: JwtAuthGuard only, no `@Roles`)
- Read-only: the dashboard never writes, never emits events, never consumes events (HG-1); no audit writes (reads audit rows only)
- Soft-deletes: all counts and lists respect `deletedAt: null` (CO-003)
- KPI semantics (HG-3): mensajes pendientes = `QUEUED`; mensajes enviados = `SENT`; conversaciones abiertas = `OPEN`; clientes nuevos = `Customer.createdAt` in current month; compras del mes = `Purchase.purchaseDate` in current month; automatizaciones programadas = `SCHEDULED`; próximas campañas = `ACTIVE` con `startAt` futura, orden asc; campañas recientes = `createdAt` desc
- Response envelope `{ data }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21)
- Secrets: no new env vars; activity feed may expose `userId` + user name only (no PII of customers, no message content)

**Scale/Scope**: Dashboard v1 only — summary KPIs + campaigns panel + activity feed. OUT: real-time pushes/websockets, DashboardUpdated event consumers (HG-1), denormalized counters, IA predictiva / pronóstico de recompra / alertas inteligentes (02-modules.md "Futuras mejoras"), per-module drill-down reports (→ Módulo 08 Reportes), date-range filtering, export/CSV.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 01, Flujo 09, event architecture consumers) + `specs/020-dashboard-v1/spec.md`; ambiguities (read model architecture, contract shape, KPI semantics) resolved via HG-1..HG-3 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | New `dashboard` module (Controller -> Service -> Prisma) with read-only aggregates over existing tables; no cross-module persistence reach; no event coupling |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/dashboard-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; every query org-scoped; no disclosure by construction |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 guards; all authenticated org roles read (precedent 018/019 HG-3) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all REST endpoints |
| VII. IDENTITY FLOWS | PASS | Not applicable; dashboard reads audit rows written by identity/other modules |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **Zero schema changes** — no migration, no destructive operations |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | No input beyond auth; controlled exceptions; activity feed exposes metadata/action/description only (never message content or customer PII) |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per endpoint + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Dashboard v1; existing modules untouched; root OpenAPI wiring only; Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-3 approved 2026-08-18 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-3 **approved** on 2026-08-18 (kit 020 = Dashboard; KPIs por cómputo on-the-fly sin tablas ni consumidores de eventos; 3 endpoints summary/campaigns/activity; semánticas KPI: QUEUED/SENT/OPEN/createdAt-mes/purchaseDate-mes/SCHEDULED/ACTIVE-startAt-futura).