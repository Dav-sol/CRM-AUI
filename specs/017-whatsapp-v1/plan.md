# Implementation Plan: WhatsApp/Messaging v1

**Branch**: `main` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-whatsapp-v1/spec.md`; domain requirements from `specs/01-mvp.md` (WhatsApp 100-104, envío/recepción/conversaciones), `specs/02-modules.md` (Módulo 07 Conversaciones 191-213), `specs/03-business-rules.md` (AU-005, AU-011, CO-001..004, AD-001..003), `specs/05-user-flows.md` (Flujo 05 — Ejecución Automática 144-164; Flujo 06 — Recepción de Mensajes 167-186; Flujo 07 — Atención Comercial 188-207), `specs/07-event-architecture.md` (MessageQueued/Sent/Delivered/Read/Received/Failed, ConversationOpened/Closed, AutomationExecuted/Failed, idempotencia, trazabilidad), `specs/08-system-architecture.md` (Scheduler 271, Colas/BullMQ futuras 261, Integraciones WhatsApp 345-347), `specs/api/API_GUIDELINES.md` (§6-8 envelope, §18 tenant, §19 idempotencia, §20-21 fechas, §24 webhooks), approved decisions HG-1..HG-13 (2026-08-17)

## Summary

WhatsApp/Messaging v1 implements the Módulo 07 foundation and the execution engine deferred by Automatizaciones v1 (kit 016 HG-1/HG-2): consuming `AutomationExecuted`-ready SCHEDULED automations via an in-process scheduler (`@nestjs/schedule`, HG-3) to send WhatsApp messages through Meta WhatsApp Cloud API (HG-2), receiving inbound messages via webhook (HG-4), opening conversations (Flujo 06, HG-5 — apertura + historial only), and exposing read + manual-send REST endpoints with tenant isolation, roles, audit and domain events. The `Conversation` and `Message` Prisma models already exist (migration `20260810000529_add_domain_entities`); the module adds an additive migration (nullable customer on Conversation HG-8; provider id columns on Message HG-13; indexes). Full conversations inbox (asignación/etiquetas/notas) is deferred to kit 018 (HG-5); AU-006/007/009 deferred (HG-9/HG-10); manual execution endpoint out of scope (HG-12).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, `@nestjs/event-emitter` (installed), `@nestjs/schedule` (**NEW, HG-3**) + Meta WhatsApp Cloud API via HTTPS (no SDK — plain `fetch`, HG-2). **One new dependency** (`@nestjs/schedule`); no BullMQ/Redis in v1 (HG-3, coherent with Imports HG-3).

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), models `Conversation` (:242-264) and `Message` (:266-293), enums `ChannelType {WHATSAPP_CLIENTS, WHATSAPP_SOCIAL}` (:491-494), `ConversationStatus {OPEN, CLOSED, ARCHIVED}` (:496-500), `MessageType {AUTOMATIC, MANUAL, INCOMING, OUTGOING}` (:502-507), `MessageDirection {INBOUND, OUTBOUND}` (:509-512), `MessageStatus {QUEUED, SENT, DELIVERED, READ, FAILED}` (:514-520). Additive migration only (HG-8, HG-13).

**Testing**: Jest + ts-jest (unit `*.spec.ts` under `src`; e2e via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: No N+1 — conversation detail preloads messages in one query; lists paginated with whitelist sort; scheduler scans due automations by index `[status, scheduledDate]` in bounded batches; inbound webhook does ≤1 customer lookup + 1 transaction per event; idempotent replays cost one existence check.

**Constraints**:
- Tenant isolation: `organizationId` from JWT only (API_GUIDELINES §18) for REST; webhook resolves organization from channel config (env, HG-6) — never trusts client body
- Roles (HG-11): reads + manual send = all roles (OPERADOR included); no write-restricted endpoints in v1 beyond provider config
- Event consumption: `@OnEvent` for scheduler tick internal + webhook handler; consumers idempotent (07:375-379) — unique `providerMessageId` backstop (HG-13), P2002 → no-op never 500
- AU-011 (FR): a SCHEDULED automation can be executed at most once — guarded by single-row status update `SCHEDULED → EXECUTED` (predicate) inside a transaction with Message creation (NR-005, precedent NR-005 of 016)
- AU-005 (FR): execution only for ACTIVE customers; INACTIVE/BLOCKED automations stay SCHEDULED (never sent, no hard error)
- Manual send (FR): OUTBOUND Message + provider call; no automation state change
- Inbound (FR): webhook → identify customer by phone (R-009 strategy) → find-or-open conversation (Flujo 06) → record INBOUND Message → emit `MessageReceived` + `ConversationOpened`
- States: Message QUEUED → SENT → DELIVERED → READ (inbound statuses updated by provider webhook) | FAILED; conversation OPEN (default) — bandeja completa fuera de alcance (HG-5)
- Existing modules NOT modified; only cross-module touches are `app.module.ts` registration of `WhatsappModule` and future OpenAPI root wiring
- Response envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21); date-only filters whole-day inclusive (NR-010 precedent)
- Secrets: WhatsApp credentials ONLY via env vars (Constitution IX); never logged

**Scale/Scope**: WhatsApp/Messaging v1 only — scheduler execution of SCHEDULED automations, outbound (automatic + manual), inbound webhook, conversation auto-open + history, message/conversation read endpoints, audit, domain events. OUT: full conversations inbox/assignment/tags (HG-5, kit 018), AU-006/007 (HG-10), AU-009 business hours (HG-9), AU-010 campaign priority (kit Campañas), BullMQ/Redis worker (HG-3), message templates/plantillas (HG-7), multi-tenant channel model (HG-6), provider-level S3/attachments, campaigns, dashboard consumers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 07, Flujo 05/06/07, AU-005/011, CO-001..004, event architecture) + `specs/017-whatsapp-v1/spec.md`; conflicts C-01..C-04 resolved via HG-1..HG-13 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service -> Provider/Scheduler) mirroring the approved module pattern; event-driven consumption per 07; scheduler in-process per HG-3 |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/whatsapp-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only on REST; webhook resolves org from env channel config (HG-6); cross-tenant → 404 |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles and guards (JwtAuthGuard, RolesGuard); reads + manual send = all roles (HG-11) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all REST endpoints; webhook endpoint authenticated by provider signature verification (HG-4) |
| VII. IDENTITY FLOWS | PASS | Not applicable; audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE (HG-8, HG-13)**: strictly additive migration — `customer_id` NULL on conversations, provider id columns on messages, indexes; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions (MESSAGE_NOT_FOUND, CONVERSATION_NOT_FOUND, PROVIDER_ERROR, VALIDATION_ERROR, FORBIDDEN); provider credentials only via env; no secrets/PII in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to WhatsApp/Messaging v1; existing modules untouched except app.module registration; Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-13 approved 2026-08-17 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-13 approved on 2026-08-17 (candidato WhatsApp/Messaging confirmado; Meta Cloud API; webhook recepción en v1; scheduler @nestjs/schedule en-proceso; conversaciones solo apertura+historial; credenciales por env; template String; customerId nullable; OPERADOR puede enviar manual; ejecución scheduler-driven; AU-009/006/007 diferidos; IDs de proveedor aditivos).
