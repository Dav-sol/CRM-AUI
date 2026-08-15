# Automatizaciones v1 — Requirements Checklist

Traceability: every requirement from the base specs and the approved HUMAN GATES (HG-1..HG-5, 2026-08-15) maps to user stories (US), functional requirements (FR) and acceptance scenarios (AS) of spec.md. Status filled at the end of the task (T149).

| ID | Requirement (source) | Acceptance criterion (AS) | Status |
|----|----------------------|---------------------------|--------|
| AR-01 | Toda compra genera 3 automatizaciones (AU-001, CP-002/003) | PurchaseImported → cycle + 3 SCHEDULED automations (US1, FR-002, AS-001) | ✅ Done |
| AR-02 | Cadencia 3d/6m/12m (HG-5, 01-mvp.md:96-97) | scheduledDate = purchaseDate + offset (FR-015, AS-013) | ✅ Done |
| AR-03 | Ciclo único por compra (04:327-328) | purchaseId unique; cycle + automations in one transaction (FR-002, AS-001) | ✅ Done |
| AR-04 | Consumidor idempotente (07:375-379) | Replayed PurchaseImported → no-op, no duplicates (FR-001, AS-002) | ✅ Done |
| AR-05 | Nueva compra cancela ciclo anterior (AU-003) | Previous ACTIVE cycle + PENDING/SCHEDULED cancelled; new ACTIVE cycle (FR-003, AS-003) | ✅ Done |
| AR-06 | Estados AU-002 | PENDING/SCHEDULED/EXECUTED/CANCELLED/ERROR mapped (FR-008, AS-006/007) | ✅ Done |
| AR-07 | Ejecutada nunca se re-ejecuta (AU-004) | Cancel of EXECUTED/CANCELLED → 400 (FR-008, AS-007) | ✅ Done |
| AR-08 | Listar ciclos (05:130-136, Módulo 05) | GET /commercial-cycles with filters + pagination (FR-004, US3) | ✅ Done |
| AR-09 | Detalle de ciclo con automatizaciones | GET /commercial-cycles/{uuid} includes automations (FR-005, AS-004) | ✅ Done |
| AR-10 | Listar automatizaciones (Módulo 05) | GET /automations with status/cycle/customer/date filters (FR-006, AS-005) | ✅ Done |
| AR-11 | Detalle de automatización | GET /automations/{uuid} (FR-007, US4) | ✅ Done |
| AR-12 | Cancelar automatización manual | POST /automations/{uuid}/cancel; PENDING/SCHEDULED only (FR-008, AS-006/007) | ✅ Done |
| AR-13 | Tenancy org del JWT (API_GUIDELINES §18) | org from JWT only; cross-tenant → 404 (FR-010, AS-008) | ✅ Done |
| AR-14 | Roles (Q11, HG-1) | Cancel = PO+ADMIN+GERENTE; reads all roles (FR-009, AS-009) | ✅ Done |
| AR-15 | Auditoría (AD-003) | automation.cycle.created/.cancelled, automation.created/.cancelled, never-throw (FR-011, AS-011) | ✅ Done |
| AR-16 | Eventos de dominio (07:172-198, 383-395) | CommercialCycleStarted + AutomationCreated (+cancel) with traceability (FR-012, AS-012) | ✅ Done |
| AR-17 | No eliminación física (CP-004, 06:329) | Soft delete only; no destructive writes (FR-013) | ✅ Done |
| AR-18 | Sin endpoints de creación manual (FR-014) | Only POST cancel as write endpoint (AS-010) | ✅ Done |
| AR-19 | Fechas ISO 8601 UTC (API_GUIDELINES §20-21) | All dates UTC; date-only filters whole-day (FR-015, AS-013/014) | ✅ Done |

## Checklist (Definition of Done)

- [x] Specs checked (02/03/04/05/06/07/08-business, API_GUIDELINES, kit 016)
- [x] Migration applied and reviewed (data-model.md)
- [x] Lint passes
- [x] Typecheck passes
- [x] Formatting passes
- [x] Unit tests green (automations unit 25, controller 3; overall 248/248)
- [x] E2E tests green (automations.e2e-spec.ts 10/10; overall 108/108)
- [x] Combined suite green (356/356)
- [x] Coverage: all files 94.32% stmts; automations module 96.29% stmts (>80%)
- [x] OpenAPI wired and `api:validate` green
- [ ] No unrelated files modified (review in T149)
- [ ] No secrets introduced (review in T149)
- [ ] Git diff inspected (T149)

## Notes

- Implemented 2026-08-15 (kit 016). Exception: `imports.e2e-spec.ts` cleanup extended to delete `automation`/`commercial_cycle` rows before `purchase` because the new consumer creates them for every imported purchase (FK dependency) — required for the suite to stay green.
- File names in OpenAPI: `AutomationDetails.yaml` (not `AutomationDetail`), `CancelAutomationResponse.yaml`; CommercialCycle uses Summary/Details/ListResponse/Response only (no base `CommercialCycle.yaml` since it adds nothing over Summary).
- Migration name differs from T139 draft (`add_automations_v1_fields` without the `20260815` timestamp): final name `20260815184029_add_automations_v1_fields`.