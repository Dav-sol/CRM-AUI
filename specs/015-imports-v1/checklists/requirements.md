# Imports v1 — Requirements Checklist

Traceability: every requirement from the base specs and the approved HUMAN GATES (HG-1..HG-18, 2026-08-14) maps to user stories (US), functional requirements (FR) and acceptance scenarios (AS) of spec.md. Status filled at the end of the task (T136).

| ID | Requirement (source) | Acceptance criterion (AS) | Status |
|----|----------------------|---------------------------|--------|
| IR-01 | Importar clientes (IM-001, HG-1) | Customers upsert by `codcli` (US3, FR-008, AS-001/007) | Pendiente |
| IR-02 | Importar productos (HG-1) | Products upsert by `code` (US4, FR-009, AS-002) | Pendiente |
| IR-03 | Importar compras (HG-1) | Purchases created, CP-005 duplicates skipped (US5, FR-010, AS-003) | Pendiente |
| IR-04 | Formato XLSX (05:84, HG-2) | Upload .xlsx accepted (US2, FR-002, AS-001) | Pendiente |
| IR-05 | Formato CSV (08:327-329, HG-2) | Upload .csv accepted (US2, FR-002, AS-002) | Pendiente |
| IR-06 | Validación de estructura (IM-002) | Column structure validated in VALIDATING (US2, FR-007, AS-004) | Pendiente |
| IR-07 | Errores de estructura → job falla (IM-002) | Structural errors → FAILED + errors populated (FR-007, AS-004) | Pendiente |
| IR-08 | Orden clientes→productos→compras (IM-001, HG-7) | Dependencies resolved in order; missing ref → row error (FR-010, AS-008/010) | Pendiente |
| IR-09 | Importación asíncrona (API_GUIDELINES §22, HG-3) | 201 returns PENDING job; processing in background (FR-022, AS-001) | Pendiente |
| IR-10 | No bloquear la petición HTTP (§22) | Processor never awaited by controller (FR-022) | Pendiente |
| IR-11 | No eliminar información (02:130, HG-8) | No destructive writes; soft-deleted records restored on import (FR-008/009) | Pendiente |
| IR-12 | Registro histórico de importaciones (IM-004, HG-17) | Jobs soft-deleted only; list/detail retained (FR-015/016/023) | Pendiente |
| IR-13 | Consultar estado/progreso (05:85-89) | Status + counters via GET detail (US6, FR-015/016, AS-007) | Pendiente |
| IR-14 | Errores por fila (IM-006) | Row errors in errorsSummary with row/field/message (FR-011, AS-008) | Pendiente |
| IR-15 | Continuar ante error por fila (IM-006) | Job continues; no rollback of processed rows (FR-012, AS-009) | Pendiente |
| IR-16 | Estado parcial (IM-006, HG-6) | PARTIAL when >0 errors; COMPLETED when 0 (FR-011, AS-009) | Pendiente |
| IR-17 | Detalle del registro histórico (IM-004) | Detail includes counters, dates, error summary (FR-016) | Pendiente |
| IR-18 | Auditoría (AD-003, HG-13) | import.create/start/complete/fail/retry/cancel audited, never-throw (FR-020, AS-019) | Pendiente |
| IR-19 | Upsert clientes por codcli (CL-003, HG-8) | Update not duplicate; codcli immutable (FR-008, AS-007) | Pendiente |
| IR-20 | Actualización de teléfono con historial (03:374-379) | Phone updated keeping history (FR-008) | Pendiente |
| IR-21 | Compras duplicadas (CP-005) | Tuple (invoiceNumber, customerId, productId, purchaseDate) skipped (FR-010, AS-003) | Pendiente |
| IR-22 | Eventos de dominio (HG-9, 07:244-254/74/156/164) | ImportStarted/Validated/Completed/Failed + row events with traceability (FR-021, AS-020) | Pendiente |
| IR-23 | Idempotencia de archivo (IM-005, HG-5) | file_hash unique per org → 409; Idempotency-Key replay → 200 (FR-004/005, AS-005/006) | Pendiente |
| IR-24 | Tenancy org del JWT (API_GUIDELINES §18, HG-12) | org from JWT only; PO validated org; cross-tenant → 404 (FR-017, AS-014/015) | Pendiente |
| IR-25 | Roles (HG-11) | Writes PO+ADMIN+GERENTE; reads all roles (FR-018, AS-016) | Pendiente |
| IR-26 | Límites 25 MB / 50.000 filas (HG-4) | 413/400 enforcement (FR-002, AS-018) | Pendiente |
| IR-27 | Cancelar importación (HG-16) | PENDING/VALIDATING/PROCESSING → CANCELLED; final → 400 (FR-013, AS-011) | Pendiente |
| IR-28 | Reintentar (HG-15) | FAILED/PARTIAL → PROCESSING, only error rows reprocessed (FR-014, AS-012) | Pendiente |
| IR-29 | No exponer rutas internas (NR-006) | filePath absent from all responses (FR-024, AS-022) | Pendiente |
| IR-30 | Seguridad CSV injection (INFERENCIA, NR-005) | Formula cells neutralized (AS-023) | Pendiente |

## Checklist (Definition of Done)

- [ ] Specs checked (03/04/05/06/07/08-business, API_GUIDELINES, kit 015)
- [ ] Migration applied and reviewed (data-model.md)
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Formatting passes
- [ ] Unit tests green (>80% imports coverage)
- [ ] E2E tests green (imports.e2e-spec.ts)
- [ ] Combined suite green
- [ ] OpenAPI wired and `api:validate` green
- [ ] No unrelated files modified
- [ ] No secrets introduced
- [ ] Git diff inspected
