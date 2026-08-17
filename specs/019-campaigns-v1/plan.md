# Implementation Plan: Campaigns v1

**Branch**: `main` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-campaigns-v1/spec.md`; domain requirements from `specs/01-mvp.md` ("No existen campañas de recompra" 19; objetivo "Automatizar campañas de WhatsApp" 33), `specs/02-modules.md` (Módulo 06 Campañas 165-189 — Crear campaña, Plantillas, Segmentación, Programación, Estadísticas; Segmentos 179-188), `specs/03-business-rules.md` (CA-001..003 271-293; AU-010 257-262), `specs/04-domain-model.md` (Campaña 113-121 "una campaña puede generar miles de automatizaciones"; Agregado Campaña 233-239), `specs/05-user-flows.md` (Flujo 08 — Creación de Campaña 209-227), `specs/06-database.md` (Campaign 174-187; Automation 190-203), `specs/07-event-architecture.md` (CampaignCreated/Updated/Activated/Finished/Cancelled 200-210; AutomationExecuted 195; trazabilidad 383-395; idempotencia 375-379), `specs/016-automations-v1/spec.md` (diferido a Campañas: AU-010, CA-001..003), `specs/017-whatsapp-v1/spec.md` (plantillas HG-7 93), `specs/018-conversations-inbox-v1/spec.md` (campaigns OUT), approved decisions HG-1..HG-9 (kit 019, 2026-08-17)

## Summary

Campaigns v1 implements Módulo 06 Campañas on top of the WhatsApp foundation (kit 017) and the automation scheduler: org-scoped campaign CRUD (DRAFT), lifecycle transitions (DRAFT → ACTIVE → PAUSED → FINISHED | CANCELLED), segment definition (city + product + purchase date + customer status, AND — HG-7) stored on the campaign, a segment dry-run endpoint, and activation that generates one `SCHEDULED` Automation per qualifying customer (HG-6: only customers with purchases; `Automation.purchaseId` NOT NULL kept). The campaign message template is free text on `Campaign.template` (HG-2); at execution the WhatsApp scheduler uses the campaign template (additive change in the whatsapp module). The kit adds an additive migration (columns `start_at` and `segment` on `campaigns`) and emits `CampaignCreated/Updated/Activated/Finished/Cancelled` events (07:200-210). AU-010 (max 1 campaign per company period) is deferred to Configuración (HG-4): no window validation, no hardcoded period. Dashboard (kit 020) consumes later; this kit emits no dashboard events (HG-9).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, `@nestjs/event-emitter` (installed). **No new runtime dependencies** — the whatsapp scheduler already executes `SCHEDULED` automations (kit 017); campaigns only create them.

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). Existing `Campaign` (:197-215: `name`, `description?`, `type`, `template`, `status` DRAFT/ACTIVE/PAUSED/FINISHED/CANCELLED, soft-delete) and `Automation` (:217-247: `campaignId?`, `purchaseId` NOT NULL, `scheduledDate`, `status` PENDING/SCHEDULED/EXECUTED/CANCELLED/ERROR/PAUSED, `priority`). New additive columns on `campaigns`: `start_at` (send date, HG-5 "Programada" = ACTIVE with future `startAt`) and `segment` (jsonb segment filters, HG-7). Additive migration only (HG-5/HG-7).

**Testing**: Jest + ts-jest (unit `*.spec.ts` under `src`; e2e via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: Activation of a large campaign creates up to `MAX_AUTOMATIONS_PER_CAMPAIGN` (constant, default 5.000) automations in batches (500) inside a single transaction (HG-8); segment query dedupes by customer (one automation per customer, most recent qualifying purchase); no N+1 in reads (`automationCount`/`executedCount` via `groupBy`); all list paths tenant-scoped and indexed (`[organizationId]` on campaigns).

**Constraints**:
- Tenant isolation: `organizationId` from JWT only (API_GUIDELINES §18); cross-tenant → 404 `CAMPAIGN_NOT_FOUND` (precedent R-005 of 017/018)
- Roles (HG-3): **all authenticated organization roles** manage campaigns (create/update/activate/pause/resume/cancel/preview) — no `@Roles` restriction (JwtAuthGuard only, 018 precedent for all-role reads)
- Event consumption: `@OnEvent` consumers idempotent (07:375-379); campaign events emitted after commit (NR-004 precedent)
- Lifecycle (HG-5): DRAFT → ACTIVE (future `startAt` = "Programada") → PAUSED ↔ ACTIVE; ACTIVE/PAUSED → FINISHED (auto, when no SCHEDULED automations remain) | CANCELLED (cancels pending automations); guarded single-row status updates (NR-005 precedent)
- Segmentation (HG-7): optional filters `city` (case-insensitive contains, consistent with customers list), `productId` (product uuid), `purchaseFrom/purchaseTo` (whole-day inclusive, NR-010), `customerStatus`; AND combination; **at least one criterion required**
- Activation (HG-6, HG-8): one automation per qualifying customer (most recent purchase); `scheduledDate = max(startAt, now)`; `status = SCHEDULED`; `priority = 0`; segment > limit → 400 `SEGMENT_TOO_LARGE`; batch 500 inside the activate transaction (atomic, NR-005)
- Execution (additive whatsapp change): scheduler executes campaign automations only while the campaign is `ACTIVE`; message content = campaign `template` with `{customerName}`/`{productName}`/`{organizationName}` placeholders (fallback `AUTOMATIC_TEMPLATE`)
- AU-010 deferred (HG-4): no period window validation, no hardcoded limit of 1; Configuración becomes source of truth later
- Campaigns never physically deleted (CO-003 spirit, CA-002); `CANCELLED` is the terminal state; no DELETE endpoint in v1
- Existing modules modified only additively: `app.module.ts` registration of `CampaignsModule`; whatsapp scheduler where/include + content resolution (no behavioral change to existing 017/016 automations), and root OpenAPI wiring
- Response envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21); date-only filters whole-day inclusive (NR-010 precedent)
- Secrets: no new env vars; never log message content (PII, Constitution IX); audit/events carry ids only

**Scale/Scope**: Campaigns v1 only — CRUD + lifecycle, segment definition/preview, activation (bulk automation generation). OUT: AU-010 window/priority policy (HG-4 → Configuración), plantillas reales (HG-2/017-HG-7 → Configuración), AU-009 business hours (→ Configuración), predefined segment presets (clientes nuevos/frecuentes/inactivos/recompra → future), campaign statistics/reporting (→ Reportes Módulo 08), WhatsApp SOCIAL/multi-channel, retries of FAILED messages, dashboard consumers (HG-9 → kit 020).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 06, Flujo 08, CA-001..003, AU-010, event architecture) + `specs/019-campaigns-v1/spec.md`; ambiguities (segment storage, lifecycle, roles, bulk limits, campaign type semantics) resolved via HG-1..HG-9 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | New `campaigns` module (Controller -> Service -> Prisma) reusing the automation scheduler via `SCHEDULED` automations + additive whatsapp content resolution; event-driven finish detection via `@OnEvent('AutomationExecuted')`; no cross-module reach into persistence |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/campaigns-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only on REST; cross-tenant → 404; segments/automations org-scoped |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles/guards; all authenticated roles manage campaigns (HG-3) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard + RolesGuard on all REST endpoints |
| VII. IDENTITY FLOWS | PASS | Not applicable; audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE (HG-5/HG-7)**: strictly additive migration — two new columns on `campaigns`, no destructive changes, no backfills; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs (nested segment); controlled exceptions (CAMPAIGN_NOT_FOUND, VALIDATION_ERROR, SEGMENT_TOO_LARGE, FORBIDDEN); no message/segment PII in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Campaigns v1; existing modules touched additively only (whatsapp scheduler where/include/content, module registration, OpenAPI wiring); Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-9 approved 2026-08-17 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-9 **approved** on 2026-08-17 (kit 019 = Campañas; template = texto libre en `Campaign.template` sin entidad Template; gestión abierta a todos los roles; AU-010 diferido a Configuración sin período hardcodeado; "Programada" = ACTIVE con `startAt` futura sin `SCHEDULED`; solo clientes con compras, `purchaseId` NOT NULL; segmentación ciudad+producto+fecha+estado AND con ≥1 criterio; límite configurable + batches + transacción; Dashboard kit 020 sin eventos de dashboard en 019).