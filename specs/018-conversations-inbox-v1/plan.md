# Implementation Plan: Conversations Inbox v1

**Branch**: `main` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-conversations-inbox-v1/spec.md`; domain requirements from `specs/01-mvp.md` (WhatsApp/conversaciones 100-104; Flujo principal paso 9 "El asesor continúa la conversación"), `specs/02-modules.md` (Módulo 07 Conversaciones 191-213 — Bandeja, Chats, Historial, Asignación, Etiquetas, Notas, Respuestas rápidas), `specs/03-business-rules.md` (CO-001..004; AD-001..003), `specs/05-user-flows.md` (Flujo 06 — Recepción 167-186; Flujo 07 — Atención Comercial 188-207), `specs/07-event-architecture.md` (ConversationOpened/Assigned/Transferred/Closed/Archived 214-226, trazabilidad 383-395, idempotencia 375-379), `specs/017-whatsapp-v1/spec.md` (deferido a kit 018 HG-5: asignación, etiquetas, notas, respuestas rápidas, transiciones 89, 100; modelo Conversation/Message en schema.prisma:242-298), approved decisions HG-1..HG-8 (kit 018, 2026-08-17)

## Summary

Conversations Inbox v1 completes Módulo 07 Conversaciones (HG-5 of kit 017) on top of the WhatsApp/Messaging v1 foundation: the bandeja (inbox) with conversation lifecycle transitions (OPEN → CLOSED → ARCHIVED + reopen), advisor assignment (`Conversation.advisorId`, already present), per-conversation tags and notes, org-scoped quick replies, and the asesor reply flow (OUTBOUND `type=OUTGOING` messages, the type reserved in 017). All operations run over the existing `Conversation`/`Message` aggregates; the kit adds an additive migration (new models `ConversationTag`, `ConversationNote`, `QuickReply` and a tag-assignment relation) and emits `ConversationAssigned`, `ConversationTransferred`, `ConversationClosed`, `ConversationArchived` events (07:214-226) with traceability payloads. Out of scope: advisor notification/pause-on-open (AU-006/007, HG-10), WhatsApp SOCIAL channel, templates/plantillas (HG-7), campaigns, retries, multi-tenant channel config.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, `@nestjs/event-emitter` (installed). **No new runtime dependencies** — the reply flow reuses the existing `WhatsAppProvider` via the exported `WhatsappService` (kit 017), injected as a module dependency (`WhatsappModule`).

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). Existing `Conversation` (:242-265: `advisorId?`, `status` OPEN/CLOSED/ARCHIVED, indexes on `[advisorId]`, `[status]`, `[organizationId, status]`) and `Message` (:267-298, `MessageType` includes `OUTGOING` :502-507, reserved in 017). New additive models: `ConversationTag` (org catalog), `ConversationTagAssignment` (M2M conversation↔tag), `ConversationNote` (append-only, soft-delete), `QuickReply` (org-scoped). Additive migration only (HG-2).

**Testing**: Jest + ts-jest (unit `*.spec.ts` under `src`; e2e via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: No N+1 — conversation detail preloads messages + tags + notes in one query; tag/note lists tenant-scoped via the owning conversation; quick replies cached per organization lookup; all list paths indexed (`[organizationId, status]`, `[organizationId, advisorId]`).

**Constraints**:
- Tenant isolation: `organizationId` from JWT only (API_GUIDELINES §18) for all REST; cross-tenant → 404 `CONVERSATION_NOT_FOUND` (precedent R-005 of 017)
- Roles (HG-4/HG-5): reads (bandeja, detail, notes, tags, quick replies) = all authenticated roles (precedent 017 FR-011); writes split — quick replies and tag catalog management (create/update/delete) = ADMINISTRADOR/GERENTE; reply, notes, tag assign/remove, close/archive/reopen, **assignment/transfer** = all roles (the asesor answers, labels and assigns in Flujo 07)
- Event consumption: `@OnEvent` consumers idempotent (07:375-379); assignment/transition events emitted after commit (NR-004 precedent)
- Transitions (CO-003): OPEN → CLOSED → ARCHIVED; ARCHIVED → OPEN (reopen); guarded single-row status updates (NR-005 precedent)
- Reply: `type=OUTGOING`, `direction=OUTBOUND` (HG-6), provider call after commit (FR-003 precedent), Idempotency-Key honored (API_GUIDELINES §19)
- Records never physically deleted (CO-003, FR-015 precedent); notes soft-delete, tags soft-delete
- Existing modules modified only additively: `app.module.ts` registration of `ConversationsModule`, `WhatsappModule` export of `WhatsappService`, `whatsapp.service.ts`/`query-conversations.dto.ts` extended with read-only enrichment (advisor/tags/notes in bandeja/detail + `assigned`/`tagIds` filters, no behavior change to existing 017 endpoints), and root OpenAPI wiring
- Response envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21); date-only filters whole-day inclusive (NR-010 precedent)
- Secrets: no new env vars; never log note/message content (PII, Constitution IX)

**Scale/Scope**: Conversations Inbox v1 only — bandeja + lifecycle transitions, assignment/transfer, tags, notes, quick replies, asesor reply. OUT: AU-006/007 (HG-10), WhatsApp SOCIAL, plantillas/templates (HG-7), campañas, retries, media/attachments, multi-tenant channel config, dashboard consumers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 07, Flujo 07, CO-001..004, event architecture) + `specs/018-conversations-inbox-v1/spec.md`; ambiguities (tag model, note lifecycle, quick replies management, assignment/transition permissions, reply semantics) resolved via HG-1..HG-8 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | New `conversations` module (Controller -> Service -> Repository via Prisma) reusing the whatsapp provider for replies; event-driven emission per 07; no cross-module reach into persistence |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/conversations-inbox-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only on REST; cross-tenant → 404; tag/quick-reply catalogs org-scoped |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles and guards; write-split per HG-4/HG-5 |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard + RolesGuard on all REST endpoints |
| VII. IDENTITY FLOWS | PASS | Not applicable; audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE (HG-2)**: strictly additive migration — new models/tables, no destructive changes; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions (CONVERSATION_NOT_FOUND, TAG_NOT_FOUND, QUICK_REPLY_NOT_FOUND, VALIDATION_ERROR, FORBIDDEN); no message/note PII in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Conversations Inbox v1; existing modules touched additively only (module registration/export, read-only enrichment of whatsapp bandeja/detail + filters, OpenAPI wiring); Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-8 approved 2026-08-17 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-8 **approved** on 2026-08-17 (catálogo de etiquetas org + asignación M2M; notas append-only; respuestas rápidas gestionadas por ADMINISTRADOR/GERENTE; asignación/transferencia **abierta a todos los roles**; transiciones abiertas a todos los roles con reabrir; reply OUTGOING con reabre CLOSED; migración aditiva).