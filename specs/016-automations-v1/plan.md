# Implementation Plan: Automatizaciones v1

**Branch**: `main` | **Date**: 2026-08-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-automations-v1/spec.md`; domain requirements from `specs/04-domain-model.md` (Ciclo Comercial, Automatización, invariantes 79-109, 327-330), `specs/06-database.md` (Soft Delete, Restricciones), `specs/02-modules.md` (Módulo 05 — Automatizaciones, 136-162), `specs/03-business-rules.md` (AU-001..AU-011, CP-002/CP-004, AD-003), `specs/05-user-flows.md` (Flujo 05 — future), `specs/07-event-architecture.md` (PurchaseImported, CommercialCycleStarted/Cancelled/Finished, AutomationCreated/Cancelled, idempotencia, trazabilidad), `specs/08-system-architecture.md` (BullMQ/Scheduler futuros, 261,271), `specs/api/API_GUIDELINES.md` (§6-8 envelope, §18 tenant, §20-21 fechas), approved decisions HG-1..HG-5 (2026-08-15)

## Summary

Automatizaciones v1 implements the Módulo 05 foundation: consuming `PurchaseImported` (already emitted by Imports v1, `imports.processor.ts:450`) to create a CommercialCycle + three AU-001 automations (3 days / 6 months / 12 months) transactionally, cancel pending automations and the cycle on a re-purchase (AU-003), and expose read + manual-cancel REST endpoints with tenant isolation, roles, audit and domain events. The `CommercialCycle` and `Automation` Prisma models already exist (migration `20260810000529_add_domain_entities`); the module adds an additive migration (actor fields, indexes). Execution/scheduler/WhatsApp are future (HG-1/HG-2); AU-006/007/009 deferred (HG-3); AU-010 deferred (HG-4).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, `@nestjs/event-emitter` (already installed). **No new dependencies** (HG-1/HG-2: no scheduler, no queue).

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), models `CommercialCycle` (:170-185) and `Automation` (:207-233), enums `CommercialCycleStatus {ACTIVE, FINISHED, CANCELLED}` (:454-458) and `AutomationStatus {PENDING, SCHEDULED, EXECUTED, CANCELLED, ERROR, PAUSED}` (:475-482). Additive migration only.

**Testing**: Jest + ts-jest (unit `*.spec.ts` under `src`; e2e via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: No N+1 — cycle detail preloads automations in one query; lists paginated with whitelist sort; event consumer does ≤1 lookup + 1 transaction per event; idempotent replays cost one existence check.

**Constraints**:
- Tenant isolation: `organizationId` from JWT only (API_GUIDELINES §18); cross-tenant → 404 `AUTOMATION_NOT_FOUND`/`COMMERCIAL_CYCLE_NOT_FOUND`; `TenantScopeGuard` MUST NOT be used (precedent R-005); enforcement in service layer
- Roles (Q11, HG-1): reads = all roles; cancel = PLATFORM_OWNER + ADMINISTRADOR + GERENTE; OPERADOR read-only
- Event consumption: `@OnEvent('PurchaseImported')`; idempotent (07:375-379) — unique `purchaseId` backstop (schema.prisma:173), P2002 → no-op never 500
- AU-001 (FR-002): cycle + 3 automations in ONE transaction; `scheduledDate = purchaseDate + 3d / +6m / +12m` (HG-5)
- AU-003 (FR-003): new purchase for customer with ACTIVE cycle → cancel old cycle (PENDING/SCHEDULED → CANCELLED, cycle → CANCELLED with endDate) + create new ACTIVE cycle, transactional
- States (AU-002): v1 transitions SCHEDULED (created) → CANCELLED; manual cancel only from PENDING/SCHEDULED (AU-004); EXECUTED/PAUSED reserved
- No manual create endpoints (FR-014); POST cancel is the only write endpoint
- Events: `CommercialCycleStarted`, `AutomationCreated` (×3), `AutomationCancelled`, `CommercialCycleCancelled`; traceability payloads (07:383-395)
- Audit (FR-011): `automation.cycle.created/.cancelled`, `automation.created/.cancelled` with `.success/.failure`, never-throw (AuditIdentityService)
- Existing modules are NOT modified; the only cross-module touch is `app.module.ts` registration of `AutomationsModule` and future OpenAPI root wiring
- Response envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21); date-only filters whole-day inclusive (NR-010)

**Scale/Scope**: Automatizaciones v1 only — event-driven cycle+automation creation (AU-001), AU-003 re-purchase cancellation, list/detail of cycles and automations, manual cancel, tenant isolation, roles, audit, domain events. OUT: execution/message sending (HG-1), scheduler/BullMQ (HG-2), AU-006/007/009 (HG-3), AU-010 (HG-4), campaigns, dashboard consumers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 05, AU-001..011, CP-002/004, domain model, event architecture) + `specs/016-automations-v1/spec.md`; conflicts C-01..C-04 resolved via HG-1..HG-4 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service) mirroring the approved module pattern; event-driven consumption per 07; no new architecture beyond the sanctioned event emitter |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/automations-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; cross-tenant → 404; event consumer runs in the purchase's organization scope |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles and guards (JwtAuthGuard, RolesGuard); cancel = PLATFORM_OWNER + ADMINISTRADOR + GERENTE, reads = all roles (HG-1/Q11) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all automation endpoints; no new token/session logic |
| VII. IDENTITY FLOWS | PASS | Not applicable; audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE (HG-1..HG-5)**: strictly additive migration — nullable actor columns + indexes; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions (AUTOMATION_NOT_FOUND, COMMERCIAL_CYCLE_NOT_FOUND, VALIDATION_ERROR, FORBIDDEN); audit metadata sanitized; no secrets/PII in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Automatizaciones v1; existing modules untouched except app.module registration; Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-5 approved 2026-08-15 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-5 approved on 2026-08-15 (ciclo + gestión sin ejecución; sin scheduler v1; AU-006/007/009 diferidos con hooks; AU-010 diferido; cadencia purchaseDate + 3d/6m/12m).