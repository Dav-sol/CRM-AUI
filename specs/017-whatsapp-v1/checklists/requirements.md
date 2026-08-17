# WhatsApp/Messaging v1 — Requirements Checklist

Traceability: every requirement from the base specs and the approved HUMAN GATES (HG-1..HG-13, 2026-08-17) maps to user stories (US), functional requirements (FR) and acceptance scenarios (AS) of spec.md. Status filled at the end of the task (T169); OpenAPI wiring closed in T167.

| ID | Requirement (source) | Acceptance criterion (AS) | Status |
|----|----------------------|---------------------------|--------|
| WR-01 | Ejecución automática de automatizaciones (Flujo 05, 05:144-164) | Scheduler executes due SCHEDULED automations → OUTBOUND Message, EXECUTED (US1, FR-001/002/003, AS-001) | ✅ Done |
| WR-02 | Sin doble envío (AU-011, 03:263-267) | Single-row SCHEDULED→EXECUTED guard; concurrent ticks → single message (FR-002, NR-005, AS-002) | ✅ Done |
| WR-03 | Solo clientes activos (AU-005, 03:215-218) | INACTIVE/BLOCKED → stays SCHEDULED, no message (FR-001, AS-003) | ✅ Done |
| WR-04 | Ejecutada nunca se re-ejecuta (AU-004, 03:209-212) | EXECUTED automation never runs again (FR-002, AS-001/002) | ✅ Done |
| WR-05 | Envío manual (Flujo 07 respuesta, 01-mvp.md:52) | POST /messages OUTBOUND MANUAL + provider (US2, FR-004, AS-004) | ✅ Done |
| WR-06 | OPERADOR puede enviar (HG-11, Flujo 07) | Manual send for OPERADOR → 200/201 (FR-011, AS-005) | ✅ Done |
| WR-07 | Recepción de mensajes (Flujo 06, 05:167-186) | Signed webhook → identify customer, INBOUND Message, conversation OPENED (US3, FR-005, AS-006) | ✅ Done |
| WR-08 | Número desconocido (HG-8, Flujo 06) | Conversation with customerId=null created (FR-005, AS-007) | ✅ Done |
| WR-09 | Idempotencia entrante (07:375-379, HG-13) | Replayed providerMessageId → no-op, no duplicates (FR-005/006, NR-006, AS-008) | ✅ Done |
| WR-10 | Historial de conversación (Flujo 06/07, CO-002/004) | GET /conversations/{uuid} with messages in one query (US4, FR-008, NR-003, AS-009) | ✅ Done |
| WR-11 | Listar conversaciones/mensajes (Módulo 07) | GET lists with filters + pagination (US5, FR-007/009, AS-010) | ✅ Done |
| WR-12 | Tenancy org del JWT (API_GUIDELINES §18) | org from JWT only; webhook org from env channel (HG-6); cross-tenant → 404 (FR-012, AS-011) | ✅ Done |
| WR-13 | Roles (HG-11) | Reads + manual send = all authenticated roles (FR-011, AS-005) | ✅ Done |
| WR-14 | Auditoría (AD-003) | message.send/received, conversation.opened, automation.executed, never-throw (FR-013, AS-013) | ✅ Done |
| WR-15 | Eventos de dominio (07:194-242, 383-395) | Message*/ConversationOpened/AutomationExecuted+Failed with traceability (FR-014, AS-001/006) | ✅ Done |
| WR-16 | No eliminación física (CP-004, 06:329) | Soft delete only; no destructive writes (FR-015) | ✅ Done |
| WR-17 | Sin ejecución manual de automatizaciones (HG-12) | No manual execution endpoint; only manual message send (FR-016) | ✅ Done |
| WR-18 | Fechas ISO 8601 UTC (API_GUIDELINES §20-21) | All dates UTC; date-only filters whole-day (FR-017, NR-010, AS-014) | ✅ Done |
| WR-19 | Migración aditiva (HG-8, HG-13, R-013) | customer_id nullable + providerMessageId/providerConversationId + unique/indexes; no destructive changes | ✅ Done |
| WR-20 | Scheduler en-proceso (HG-3, 08:271) | @nestjs/schedule tick; disabled NODE_ENV=test (FR-001, NR-012) | ✅ Done |
| WR-21 | Webhook autenticado por proveedor (HG-4) | Signature HMAC; invalid → 401; handshake token (FR-005, R-017) | ✅ Done |

## Checklist (Definition of Done)

- [x] Specs checked (02/03/04/05/06/07/08-business, API_GUIDELINES, kits 012/016)
- [x] Migration generated, SQL reviewed (data-model.md), applied
- [x] Lint passes
- [x] Typecheck passes
- [x] Formatting passes
- [x] Unit tests green (whatsapp suites + overall)
- [x] E2E tests green (whatsapp.e2e-spec.ts + overall)
- [x] Combined suite green
- [x] Coverage target >80% (whatsapp module)
- [x] OpenAPI wired and `api:validate` green (T167)
- [x] No unrelated files modified (reviewed in T169)
- [x] No secrets introduced (reviewed in T169)
- [x] Git diff inspected (T169)

## Notes

- Decision R-010 (C-05): automatic/manual outbound auto-opens the customer's conversation (keeps `Message.conversationId` NOT NULL) — no schema change required beyond HG-8/HG-13.
- Decision R-009 (Q6): inbound customer identification by normalized phone is best-effort (Customer.phone free-form); unknown → conversation with `customerId=null` (HG-8). Exact matching semantics depend on real phone data; v1 records raw `from` via provider fields.
- Out of scope v1: full inbox (HG-5), AU-006/007 (HG-10), AU-009 (HG-9), templates (HG-7), BullMQ (HG-3), campaigns, dashboard consumers, retries, conversation transitions (kit 018).
- Implementation notes (T169): the scheduler runs in-process with `@Interval(60s)` and is a no-op when `app.environment === 'test'`; the e2e jest config (`test/jest-e2e.json`) forces `NODE_ENV=test` via `setupFiles` so the scheduler never contaminates any e2e suite (verified: `automations.e2e-spec.ts` creates a due +3d automation that would otherwise be executed mid-run). The provider mock used by `whatsapp.e2e-spec.ts` returns a unique `providerMessageId` per call to respect the `@@unique([organizationId, providerMessageId])` constraint.
- Contract↔implementation discrepancies resolved in T167: manual send provider failure now returns `502 PROVIDER_ERROR` (`BadGatewayException`, was `400`); webhook handshake token mismatch now returns `403 INVALID_VERIFY_TOKEN` (`ForbiddenException`, was `401`); webhook valid-but-irrelevant payloads return 200 (no 202); POST /messages 201 body documents the final status (`SENT`/`FAILED`, not `QUEUED`) because the provider call is synchronous. OpenAPI (`specs/api`) now exposes `/conversations`, `/conversations/{uuid}`, `/messages`, `/messages/{uuid}` and `POST /messages`; `api:validate` green.