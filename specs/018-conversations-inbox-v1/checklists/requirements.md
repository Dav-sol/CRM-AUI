# Conversations Inbox v1 — Requirements Checklist

Traceability: every requirement from the base specs (Módulo 07, Flujo 07, CO-001..004, event architecture) and the approved HUMAN GATES (HG-1..HG-8, 2026-08-17) maps to user stories (US), functional requirements (FR) and acceptance scenarios (AS) of spec.md. Status filled at the end of the task.

| ID | Requirement (source) | Acceptance criterion (AS) | Status |
|----|----------------------|---------------------------|--------|
| CR-01 | Bandeja (Módulo 07, 02:191-196) | GET /conversations extended with assigned/tagIds/status filters; rows carry advisor + tags (US1, FR-001, AS-001) | ✅ Done |
| CR-02 | Detalle con historial (Flujo 07 steps 1-2, CO-002/004) | GET /conversations/{uuid} includes messages + tags + notes in one query (US2, FR-002, NR-003, AS-002) | ✅ Done |
| CR-03 | Respuesta del asesor (Flujo 07 step 3, 05:194-196) | POST /conversations/{uuid}/messages → OUTGOING/OUTBOUND, QUEUED→SENT/FAILED, Idempotency-Key (US3, FR-003, AS-003) | ✅ Done |
| CR-04 | Reply reabre CLOSED (HG-5, Flujo 07 "Responde") | Reply to CLOSED → reopens OPEN atomically (FR-003, NR-004, AS-004) | ✅ Done |
| CR-05 | Reply a ARCHIVED rechazado (HG-5) | Reply to ARCHIVED → 400 VALIDATION_ERROR (FR-003, AS-005) | ✅ Done |
| CR-06 | Asignación/transferencia (Módulo 07, 02:201; HG-4) | assign/transfer set advisorId, same-org target, events emitted, any authenticated role (US4, FR-004, AS-006/007) | ✅ Done |
| CR-07 | Transiciones de estado (CO-003, 03:296-308; HG-5) | close/archive/reopen guarded, all roles, events ConversationClosed/Archived (US5, FR-005, AS-008) | ✅ Done |
| CR-08 | Etiquetas (Módulo 07, 02:204; HG-1) | Org catalog CRUD (ADMINISTRADOR/GERENTE) + assign/remove per conversation (all roles) (US6, FR-006, AS-009) | ✅ Done |
| CR-09 | Notas (Módulo 07, 02:205; Flujo 07 step 4; HG-2) | Append-only create + list per conversation (US7, FR-007, AS-010) | ✅ Done |
| CR-10 | Respuestas rápidas (Módulo 07, 02:205; HG-3) | Org CRUD (ADMINISTRADOR/GERENTE), usage all roles, referenced by reply (US8, FR-008, AS-011) | ✅ Done |
| CR-11 | Auditoría (AD-001..003) | assign/transfer/close/archive/reopen/note/tag/quick-reply/reply audited, never-throw (FR-009, AS-013) | ✅ Done |
| CR-12 | Eventos de dominio (07:214-226, 383-395) | ConversationAssigned/Transferred/Closed/Archived with traceability, emitted after commit (FR-010, AS-006/008) | ✅ Done |
| CR-13 | No eliminación física (CO-003, 03:296-302; CP-004) | Soft delete only on tags/notes/quick-replies/assignments (FR-011) | ✅ Done |
| CR-14 | Tenancy org del JWT (API_GUIDELINES §18) | org from JWT only; cross-tenant → 404 CONVERSATION_NOT_FOUND (FR-002, NR-001, AS-012) | ✅ Done |
| CR-15 | Roles (HG-4/HG-5, 011 Identity v1) | Reads/reply/notes/transitions/assignment all roles; tag catalog + quick replies mgmt ADMINISTRADOR/GERENTE (FR-004/006/008, AS-006/009/011) | ✅ Done |
| CR-16 | Concurrencia/idempotencia (07:375-379, NR-005) | Guarded transitions, P2002 no-op, duplicate Idempotency-Key → same result (FR-003/005, AS-014) | ✅ Done |
| CR-17 | Migración aditiva (HG-2, R-011) | New tables only (tags/assignments/notes/quick replies); no enum/destructive changes | ✅ Done |

## Checklist (Definition of Done)

- [x] Specs checked (02/03/04/05/07, API_GUIDELINES, kit 017)
- [x] Migration generated, SQL reviewed (data-model.md), applied
- [x] Lint passes
- [x] Typecheck passes
- [x] Formatting passes
- [x] Unit tests green (conversations suites + overall)
- [x] E2E tests green (conversations.e2e-spec.ts + overall)
- [x] Combined suite green
- [x] Coverage target >80% (conversations module)
- [x] OpenAPI wired (conversation-tags/quick-replies/notes paths + schemas) and `api:validate` green
- [x] No unrelated files modified
- [x] No secrets introduced
- [x] Git diff inspected

## Notes

- HUMAN GATES approved 2026-08-17: HG-1 (org tag catalog + M2M assignments; catalog mgmt ADMINISTRADOR/GERENTE, assign all roles), HG-2 (notes append-only; strictly additive migration), HG-3 (quick replies org-scoped CRUD by ADMINISTRADOR/GERENTE, usage all roles; distinct from WhatsApp templates), HG-4 (assignment/transfer open to **all authenticated roles**, same-org targets), HG-5 (close/archive/reopen all roles, guarded; reply reopens CLOSED; ARCHIVED → 400), HG-6 (reply = conversation-scoped OUTGOING/OUTBOUND), HG-7 (module placement: new `conversations` module reusing `WhatsappService`), HG-8 (reopen-on-reply semantics).
- The bandeja extends 017's `GET /conversations` (additive fields — no breaking change); 017 endpoints/behavior unchanged.
- Out of scope v1 (recorded in spec.md §7): AU-006/007 (HG-10), WhatsApp SOCIAL (HG-6 of 017), templates/plantillas (HG-7 of 017), campaigns, retries, media, multi-tenant channel config, auto-assignment.