# Implementation Plan: SMS v1

**Branch**: `main` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-sms-v1/spec.md`; domain requirements from `specs/03-business-rules.md` (anti-spam playbook §14, §15 opt-out), `specs/04-domain-model.md` (channel abstraction), `specs/07-event-architecture.md` (MessageQueued/Sent/Failed events), `specs/017-whatsapp-v1/` (existing provider pattern), `specs/019-campaigns-v1/` (campaign lifecycle to extend), `specs/021-follow-up-sequences-v1/` (sequence stages inherit channel). Approved Human Gates HG-1..HG-6 (2026-08-31): provider deferred, new campaigns SMS-only, Message.conversationId nullable, Purchase.source enum, 100 COP/segment, reports fix included.

## Summary

SMS v1 adds SMS as the first non-WhatsApp outbound channel for CRM campaigns and post-sale automations. It introduces a pluggable `SmsProvider` abstraction (`messaging/` module), extends `ChannelType` with `SMS`, adds `ChannelAccount` for provider/sender isolation, makes `Message.conversationId` nullable for one-way messages, tracks cost per message with SMS segment awareness, and prepares `Purchase.source` for V2 attribution. The WhatsApp module receives exactly one change: a `channel` filter on its scheduler query. No behavioral changes to existing WhatsApp automations, conversations, or inbox.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, `@nestjs/schedule` (installed), `@nestjs/event-emitter` (installed). **No new runtime dependencies** — SMS execution follows the existing scheduler pattern (whatsapp.scheduler.ts precedent).

**Storage**: PostgreSQL via Prisma. Additive migration: new `ChannelAccount` model, `ChannelType.SMS` enum value, `ChannelProvider`/`ChannelAccountStatus`/`PurchaseSource` enums, new columns on `Campaign`/`Automation`/`Message`/`Purchase`, `Message.conversationId` made nullable.

**Testing**: Jest + ts-jest (unit `*.spec.ts`; e2e via `test/jest-e2e.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1`

**Performance Goals**: `SmsScheduler` batch 100 (same as WhatsApp `SCHEDULER_BATCH_SIZE`); segment calculation is O(n) pure function; cost estimation per campaign is O(stages × customers) with DB count query.

**Constraints**:
- WhatsApp module: ONLY `channel` filter added to scheduler query; zero other changes
- Provider abstraction: `SmsProvider` interface; `NullSmsProvider` for dev; real provider selected at deployment time
- Opt-out/anti-spam: identical enforcement to WhatsApp
- Quiet hours: configurable per env; TRANSACTIONAL bypasses
- Multi-instance: row-level guarded transitions (no in-memory idempotency for SMS)
- Conversation: NOT created for SMS v1; `Message.conversationId` nullable

## Constitution Check

*GATE: Must pass before Phase 0 research.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base specs + 022-sms-v1/spec.md; ambiguities resolved via HG-1..HG-6 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | New `messaging/` module (Controller → Service → Prisma) with `SmsProvider` interface; additive changes only to existing modules |
| III. API CONTRACT FIRST | PASS | OpenAPI delta defined in spec.md FR-020 before implementation |
| IV. MULTI-TENANCY | PASS | `organizationId` from JWT only; `ChannelAccount`/`Message` org-scoped |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses existing role model; all authenticated roles |
| VI. JWT AND SESSION SECURITY | PASS | Existing guards unchanged |
| VII. IDENTITY FLOWS | PASS | Not applicable |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | Additive migration: new models + nullable change + safe defaults; backfills CRM-only |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | DTOs, controlled exceptions, no secrets in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit + e2e; coverage >80% |
| XI. CHANGE CONTROL | PASS | Scope limited to SMS v1; WhatsApp module touched additively only |
| XII. GOVERNANCE | PASS | Human Gates HG-1..HG-6 approved 2026-08-31 |

**GATE RESULT**: PASS.
