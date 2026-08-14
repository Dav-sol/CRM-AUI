# Imports v1 — Tasks

## Phase 0 — Research & gates (done)

- T121: Kit 015-imports-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-18 approved 2026-08-14.

## Phase 1 — Persistence (migration)

- T122: Prisma schema delta (model Import: `createdBy`, `updatedBy`, `deletedBy`, `fileHash`, `idempotencyKey`, `@@index([organizationId, status])`, `@@unique([organizationId, fileHash])`; enum `CANCELLED`).
- T123: Generate migration (`migrate dev --create-only add_import_v1_fields`), review SQL per data-model.md, apply, verify `prisma migrate status` + typegen.

## Phase 2 — Infrastructure wiring

- T124: Install `@nestjs/event-emitter`, XLSX parser (exceljs), CSV parser (csv-parse/papaparse); register `EventEmitterModule.forRoot()` in AppModule (HG-9); add `uploads/` to .gitignore.

## Phase 3 — Domain (imports module)

- T125: `dto/create-import.dto.ts`, `dto/query-imports.dto.ts`, `dto/path-params.dto.ts` (class-validator; validation per FR-017: PLATFORM_OWNER requires organizationId, ORGANIZATION user sending it → 400).
- T126: `imports.service.ts`: create (file persist + file_hash + Idempotency-Key + concurrency 409 + duplicate 409), list (filters/pagination/sort), findScoped (404 IMPORT_NOT_FOUND), cancel (status-guarded transition), retry (status-guarded + reset counters + retain errors), audit hooks (import.create/start/complete/fail/retry/cancel, never-throw, HG-13).
- T127: `file-validator.service.ts` (extension/MIME/magic, size ≤25 MB via multer limits + post-check, row count ≤50.000, structure per type) + `errors.ts` codes.
- T128: `imports.processor.ts`: async pipeline PENDING→VALIDATING→PROCESSING→final; batch loop honoring cancel (per-batch DB status check); counters per batch; errors JSON cap (100 samples + total); retry-aware row selection (errors retained); natural-key preload (R-019); per-row transactional writes with P2002 backstop (R-008); per-type templates/validators (customers CL-003, products, purchases CP-005 + int4 cap + decimal, R-009); events (ImportStarted/Validated/Completed/Failed + row events with traceability, HG-9/FR-021); file purge hook (FR-023).
- T129: `imports.controller.ts` (POST /imports multipart, GET /imports, GET /imports/{uuid}, POST /imports/{uuid}/cancel, POST /imports/{uuid}/retry; `@Roles` writes PO+ADMIN+GERENTE; reads all); register `ImportsModule` in AppModule.

## Phase 4 — Tests

- T130: Unit `imports.service.spec.ts` — create (replay/concurrency/duplicate/tenant), list filters, findScoped 404, cancel/retry transitions, audit calls (US1/6/8/9/10/11).
- T131: Unit `imports.processor.spec.ts` — validation failures, partial success, ordering (IM-001), retry-only-error-rows, cancel mid-flight, counters, events emitted (US2/3/4/5/7/12; AS-001..AS-012, AS-020, AS-021, AS-023).
- T132: Unit `imports.controller.spec.ts` — roles (403 OPERADOR writes, reads ok), params validation, envelope (AS-016, AS-018).
- T133: e2e `imports.e2e-spec.ts` — happy paths XLSX/CSV, 409s (AS-005, AS-017), Idempotency-Key (AS-006), cancel/retry (AS-011/012), cross-tenant 404 (AS-014), 413/415 (AS-018), date filters (AS-024), audit rows (AS-019).

## Phase 5 — OpenAPI

- T134: Fill `specs/api/components/schemas/ImportJob/` (ImportJob, ImportJobSummary, ImportJobDetails, ImportJobResponse, ImportJobListResponse, CreateImportJobRequest, UpdateImportJobRequest) + `specs/api/paths/imports.yaml` (5 endpoints, multipart, security bearerAuth on all 5) mirroring products wiring (a3ffbf8 conventions); wire into root `specs/api/openapi.yaml` with `~1`-escaped `$ref`; run `npm run api:validate` (redocly + spectral on bundle) green.

## Phase 6 — Gates & delivery

- T135: Lint/typecheck/format (`npm run lint`, `npx tsc --noEmit -p apps/api`, prettier); build; unit + e2e + combined suites green; coverage imports module >80%.
- T136: Update spec checklist (checklists/requirements.md → done/notes); review diff (no unrelated files, no secrets); Conventional Commit `feat(imports): implement imports v1` (no push unless requested).

## Out of scope (explicit)

BullMQ/worker (HG-3), S3 (HG-14), AU-001 automations (HG-10), preview/confirm API (HG-6), error report downloads (HG-6), scheduler purge (HG-17 hook only), SDK generation (R-016).
