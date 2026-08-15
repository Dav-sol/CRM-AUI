# Imports v1 — Requirements Checklist

Traceability: every requirement from the base specs and the approved HUMAN GATES (HG-1..HG-18, 2026-08-14) maps to user stories (US), functional requirements (FR) and acceptance scenarios (AS) of spec.md. Status filled at the end of the task (T136, 2026-08-15).

| ID | Requirement (source) | Acceptance criterion (AS) | Status |
|----|----------------------|---------------------------|--------|
| IR-01 | Importar clientes (IM-001, HG-1) | Customers upsert by `codcli` (US3, FR-008, AS-001/007) | ✅ Done |
| IR-02 | Importar productos (HG-1) | Products upsert by `code` (US4, FR-009, AS-002) | ✅ Done |
| IR-03 | Importar compras (HG-1) | Purchases created, CP-005 duplicates skipped (US5, FR-010, AS-003) | ✅ Done |
| IR-04 | Formato XLSX (05:84, HG-2) | Upload .xlsx accepted (US2, FR-002, AS-001) | ✅ Done |
| IR-05 | Formato CSV (08:327-329, HG-2) | Upload .csv accepted (US2, FR-002, AS-002) | ✅ Done |
| IR-06 | Validación de estructura (IM-002) | Column structure validated in VALIDATING (US2, FR-007, AS-004) | ✅ Done |
| IR-07 | Errores de estructura → job falla (IM-002) | Structural errors → FAILED + errors populated (FR-007, AS-004) | ✅ Done |
| IR-08 | Orden clientes→productos→compras (IM-001, HG-7) | Dependencies resolved in order; missing ref → row error (FR-010, AS-008/010) | ✅ Done |
| IR-09 | Importación asíncrona (API_GUIDELINES §22, HG-3) | 201 returns PENDING job; processing in background (FR-022, AS-001) | ✅ Done |
| IR-10 | No bloquear la petición HTTP (§22) | Processor never awaited by controller (FR-022) | ✅ Done |
| IR-11 | No eliminar información (02:130, HG-8) | No destructive writes; soft-deleted records restored on import (FR-008/009) | ✅ Done |
| IR-12 | Registro histórico de importaciones (IM-004, HG-17) | Jobs soft-deleted only; list/detail retained (FR-015/016/023) | ✅ Done |
| IR-13 | Consultar estado/progreso (05:85-89) | Status + counters via GET detail (US6, FR-015/016, AS-007) | ✅ Done |
| IR-14 | Errores por fila (IM-006) | Row errors in errorsSummary with row/field/message (FR-011, AS-008) | ✅ Done |
| IR-15 | Continuar ante error por fila (IM-006) | Job continues; no rollback of processed rows (FR-012, AS-009) | ✅ Done |
| IR-16 | Estado parcial (IM-006, HG-6) | PARTIAL when >0 errors; COMPLETED when 0 (FR-011, AS-009) | ✅ Done |
| IR-17 | Detalle del registro histórico (IM-004) | Detail includes counters, dates, error summary (FR-016) | ✅ Done |
| IR-18 | Auditoría (AD-003, HG-13) | import.create/start/complete/fail/retry/cancel audited, never-throw (FR-020, AS-019) | ✅ Done |
| IR-19 | Upsert clientes por codcli (CL-003, HG-8) | Update not duplicate; codcli immutable (FR-008, AS-007) | ✅ Done |
| IR-20 | Actualización de teléfono con historial (03:374-379) | Phone updated keeping history (FR-008) | ✅ Done |
| IR-21 | Compras duplicadas (CP-005) | Tuple (invoiceNumber, customerId, productId, purchaseDate) skipped (FR-010, AS-003) | ✅ Done |
| IR-22 | Eventos de dominio (HG-9, 07:244-254/74/156/164) | ImportStarted/Validated/Completed/Failed + row events with traceability (FR-021, AS-020) | ✅ Done |
| IR-23 | Idempotencia de archivo (IM-005, HG-5) | file_hash unique per org → 409; Idempotency-Key replay → 200 (FR-004/005, AS-005/006) | ✅ Done |
| IR-24 | Tenancy org del JWT (API_GUIDELINES §18, HG-12) | org from JWT only; PO validated org; cross-tenant → 404 (FR-017, AS-014/015) | ✅ Done |
| IR-25 | Roles (HG-11) | Writes PO+ADMIN+GERENTE; reads all roles (FR-018, AS-016) | ✅ Done |
| IR-26 | Límites 25 MB / 50.000 filas (HG-4) | 413/400 enforcement (FR-002, AS-018) | ✅ Done |
| IR-27 | Cancelar importación (HG-16) | PENDING/VALIDATING/PROCESSING → CANCELLED; final → 400 (FR-013, AS-011) | ✅ Done |
| IR-28 | Reintentar (HG-15) | FAILED/PARTIAL → PROCESSING, only error rows reprocessed (FR-014, AS-012) | ✅ Done |
| IR-29 | No exponer rutas internas (NR-006) | filePath absent from all responses (FR-024, AS-022) | ✅ Done |
| IR-30 | Seguridad CSV injection (INFERENCIA, NR-005) | Formula cells neutralized (AS-023) | ✅ Done |

## Checklist (Definition of Done)

- [x] Specs checked (03/04/05/06/07/08-business, API_GUIDELINES, kit 015)
- [x] Migration applied and reviewed (data-model.md)
- [x] Lint passes
- [x] Typecheck passes
- [x] Formatting passes
- [x] Unit tests green (>80% imports coverage)
- [x] E2E tests green (imports.e2e-spec.ts)
- [x] Combined suite green
- [x] OpenAPI wired and `api:validate` green
- [x] No unrelated files modified
- [x] No secrets introduced
- [x] Git diff inspected

## Notes (T136, 2026-08-15)

- All 30 requirements implemented in `apps/api/src/modules/imports/` (service, processor, parser, file-validator, controller, dto, events, constants) and covered by unit + e2e + combined suites.
- Imports module coverage: statements 83.24%, functions 90.19%, lines 83.36% (unit, >80%).
- Full suites green on 2026-08-15: unit 223/223, e2e 98/98, combined 321/321; lint/typecheck/format/build green; `api:validate` green (1 pre-existing `no-server-example.com` warning).
- Verified reference: implementation commit `0282ad3` (+ hardening `e778997`), migrations `20260814150000`/`20260814160000`, OpenAPI wiring `a3ffbf8`.
- Known limitation (out of scope, per spec §7): processing is in-process; BullMQ/Redis worker and S3 storage deferred by HG-3/HG-14.
