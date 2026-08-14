# Imports v1 — Feature Specification

## 1. Purpose

The Importador module (Módulo 04, `specs/02-modules.md:112-133`) synchronizes information from the ERP into Automatize It Platform: customers, products and purchases (HG-1). Imports are asynchronous (API_GUIDELINES §22), never delete information (02-modules.md:130), never modify the ERP (04-domain-model.md:171), and every import generates a historical record (IM-004).

## 2. Clarifications (Q&A)

- **Q1: Which entity types are importable in v1?** → A1: CUSTOMERS, PRODUCTS, PURCHASES (HG-1 approved; `ImportType` enum already supports all three, schema.prisma:507-511).
- **Q2: Which file formats?** → A2: XLSX and CSV (HG-2; 05-user-flows.md:84 "archivo Excel", 08-system-architecture.md:327-329 supports Excel+CSV).
- **Q3: Synchronous or asynchronous?** → A3: Asynchronous, in-process background processing (HG-3; API_GUIDELINES §22 "Nunca bloquear una petición HTTP"). The POST returns 201 with the job in PENDING; processing advances VALIDATING → PROCESSING → final.
- **Q4: What are the size limits?** → A4: 25 MB and 50.000 rows per file (HG-4, INFERENCIA; scale reference 08-system-architecture.md:420-429).
- **Q5: How is idempotency guaranteed?** → A5: Two mechanisms (HG-5): `file_hash` = SHA-256 of the file, unique per (organizationId, fileHash) — same file twice → 409 (IM-005); and optional `Idempotency-Key` header (API_GUIDELINES §19) — replay returns the existing job.
- **Q6: What happens when a row fails?** → A6: The row is recorded in `errors` JSON (row/field/message), counters increment, the job continues (IM-006) and finishes PARTIAL if any row failed (HG-6).
- **Q7: Is there a preview/confirmation API phase?** → A7: No (HG-6, resolves conflict C-01). The "vista previa" of 05-user-flows.md:82-89 and IM-003 is a UI-side pre-validation responsibility; the API validates the file structure server-side in the VALIDATING phase.
- **Q8: What ordering applies?** → A8: customers → products → purchases (HG-7, IM-001). Purchases referencing a customer/product that could not be resolved become row errors (IM-006), the job continues.
- **Q9: Which fields does the ERP overwrite?** → A9: upsert by natural key (HG-8): customer `codcli` (update data, CL-003; phone update keeps history, 03-business-rules.md:374-379), product `code` (update name/category/status), purchase: skip when the CP-005 tuple exists. Immutable keys: `codcli`, `code`, `invoiceNumber`.
- **Q10: Does Imports v1 introduce event infrastructure?** → A10: Yes (HG-9, resolves conflict C-02): `@nestjs/event-emitter` (EventEmitter2, 08-system-architecture.md:491-492). Events: ImportStarted, ImportValidated, ImportCompleted, ImportFailed (07:244-254) + CustomerImported, ProductImported, PurchaseImported (07:74,156,164) with traceability payloads (07:383-395) and idempotent consumers (07:375-379). No BullMQ/Redis in v1.
- **Q11: Does importing purchases trigger automations (AU-001)?** → A11: No (HG-10). PurchaseImported is emitted; the Automations module (cycles, AU-001) is future (03:177-183; 013-purchases-v1/spec.md:23).
- **Q12: Who can use Imports v1?** → A12: Writes (create/cancel/retry): PLATFORM_OWNER, ADMINISTRADOR, GERENTE; reads: all authenticated roles including OPERADOR (HG-11; 01-mvp.md:44 is explicit for Administrador).
- **Q13: How is the organization determined?** → A13: exclusively from the JWT (HG-12, API_GUIDELINES §18); PLATFORM_OWNER sends validated `organizationId`; ORGANIZATION users sending it → 400.
- **Q14: What does Imports v1 audit?** → A14: `import.create/start/complete/fail/retry/cancel` with `.success/.failure` (HG-13) via AuditIdentityService (never-throw).
- **Q15: Where are files stored?** → A15: local filesystem `uploads/org-{organizationId}/<uuid>.<ext>` (HG-14, 08:331-336); `filePath` never exposed.
- **Q16: Can a job be retried?** → A16: Yes, only FAILED/PARTIAL (HG-15): the same job record returns to PROCESSING, reprocessing only the rows previously in error (errors JSON retained until completion); all writes are idempotent upserts/skips.
- **Q17: How many concurrent jobs per organization?** → A17: 1 active (PENDING/VALIDATING/PROCESSING) per (organizationId, type); a second one of the same type → 409 (HG-16).
- **Q18: What is the lifecycle of jobs and files?** → A18: jobs are soft-deleted only, never physically removed (IM-004, 06:329); files are retained 30 days then purged (HG-17; purge hook for the future scheduler 08:271).
- **Q19: Kit numbering and entity naming?** → A19: kit `015-imports-v1`, tasks from T121 (HG-18). The Prisma model stays `Import` (schema.prisma:288); "ImportJob" is used for contracts/UI naming only (API_GUIDELINES §22, scaffolds `ImportJob/`, 09-development-standards.md:131) — no destructive rename (resolves conflict C-03).

## 3. User Stories

- **US1 (create job)**: As an ADMINISTRADOR/GERENTE/PLATFORM_OWNER, I upload a file (multipart) with its type so an ImportJob is created immediately (PENDING) and processed asynchronously.
- **US2 (validate)**: The system validates format (XLSX/CSV), extension/MIME, size (≤25 MB), row count (≤50.000) and column structure per type before processing (IM-002); structural failures → FAILED with errors.
- **US3 (import customers)**: Customer rows upsert by `codcli` (CL-003); existing records are updated (name, phone, email, city, address); phone changes keep history (03:374-379).
- **US4 (import products)**: Product rows upsert by `code` (HG-8); name/category/status updated; `code` immutable.
- **US5 (import purchases)**: Purchase rows skip when the CP-005 tuple (invoiceNumber, customerId, productId, purchaseDate) exists; customer/product resolved by `codcli`/`code`; missing references → row error (HG-7); quantity capped at int4 max (purchases R-011 precedent, commit dca47bc); value validated as decimal string.
- **US6 (track status)**: As a user, I can list and inspect jobs (status, counters, dates) with pagination and filters, and poll a job until completion (IM-004 historical record).
- **US7 (partial success)**: Rows in error are recorded without stopping the import (IM-006); the job ends COMPLETED (no errors) or PARTIAL (some errors) with accurate counters.
- **US8 (cancel)**: As an authorized user, I cancel a PENDING/VALIDATING/PROCESSING job; processing stops at the next batch boundary and the job becomes CANCELLED.
- **US9 (retry)**: As an authorized user, I retry a FAILED/PARTIAL job; only previously failed rows are reprocessed (HG-15); the job returns to PROCESSING.
- **US10 (idempotency)**: The same file uploaded twice → 409 (IM-005); a repeated request with the same Idempotency-Key returns the existing job (API_GUIDELINES §19).
- **US11 (audit)**: Every important import action is audited (AD-003, 03:410); audit failures never break the import flow.
- **US12 (events)**: The import pipeline emits ImportStarted/ImportValidated/ImportCompleted/ImportFailed and per-row CustomerImported/ProductImported/PurchaseImported with traceability payloads (HG-9).

## 4. Functional Requirements

- **FR-001**: `POST /imports` accepts `multipart/form-data` with `file` and `type` (CUSTOMERS|PRODUCTS|PURCHASES); optional `Idempotency-Key` header. Returns 201 + `ImportJob` (US1).
- **FR-002**: File validation: extension (.xlsx/.csv) + MIME + magic bytes; size ≤ 25 MB; row count ≤ 50.000 (US2, HG-4). Failures → 400/413/415 before job creation (structural) or during VALIDATING (column structure).
- **FR-003**: Job creation persists the file at `uploads/org-{organizationId}/<uuid>.<ext>` (HG-14) and stores `file_hash` = SHA-256 (HG-5).
- **FR-004**: Same (organizationId, file_hash) exists → 409 CONFLICT (IM-005). Unique index `imports_organization_id_file_hash_key`.
- **FR-005**: `Idempotency-Key` header: a repeat request with the same key (per organization + user) returns the existing job with 200 instead of creating (API_GUIDELINES §19). Key stored in `idempotency_key` column (addition to migration).
- **FR-006**: Status machine: PENDING → VALIDATING → PROCESSING → COMPLETED | PARTIAL | FAILED; cancel: PENDING/VALIDATING/PROCESSING → CANCELLED; retry: FAILED/PARTIAL → PROCESSING (US6/8/9).
- **FR-007**: Column structure per type validated in VALIDATING (IM-002); structural errors → FAILED with `errors` populated; `startedAt`/`completedAt` set accordingly.
- **FR-008**: Customers: upsert by `(organizationId, codcli)` (CL-003); fields updated: name, phone, email, city, address; a soft-deleted customer is restored (deletedAt cleared) on import (ERP is source of truth, HG-8).
- **FR-009**: Products: upsert by `(organizationId, code)`; fields updated: name, category, status; soft-deleted product restored on import.
- **FR-010**: Purchases: if the CP-005 tuple exists → skip (counted as processed, not error); otherwise create with customer/product resolved by natural key; unresolved references → row error (HG-7).
- **FR-011**: Row errors recorded as `{ row, field, message, raw? }` in `errors` JSON (capped at 100 samples + total); counters `totalRecords`, `processedRecords`, `errorRecords` accurate; final status COMPLETED (0 errors) or PARTIAL (>0) (US7, IM-006).
- **FR-012**: Per-row writes are independent transactions; already-processed rows are never rolled back when a later row fails (HG-6).
- **FR-013**: `POST /imports/{id}/cancel`: only PENDING/VALIDATING/PROCESSING → CANCELLED; final states → 400; unknown/cross-tenant → 404 (US8).
- **FR-014**: `POST /imports/{id}/retry`: only FAILED/PARTIAL → PROCESSING; reprocesses only rows present in `errors` at retry time; errors JSON retained until completion (US9, HG-15).
- **FR-015**: `GET /imports` list: filters `type`, `status`, `createdFrom`, `createdTo`, `search` (fileName contains), pagination page/limit (≤100), sort whitelist (`-createdAt` default); tenant-scoped (US6).
- **FR-016**: `GET /imports/{id}`: detail with counters, dates, status and error summary (`total` + first 10 samples); cross-tenant → 404 `IMPORT_NOT_FOUND` (US6, HG-12).
- **FR-017**: Tenant: `organizationId` from JWT only; PLATFORM_OWNER must send validated `organizationId`; ORGANIZATION users sending it → 400 `VALIDATION_ERROR` (HG-12).
- **FR-018**: Roles: POST/cancel/retry → `@Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE')`; GET → all authenticated roles (HG-11).
- **FR-019**: Concurrency: creating a job while another of the same (organizationId, type) is PENDING/VALIDATING/PROCESSING → 409 (HG-16).
- **FR-020**: Audit: `import.create`, `import.start`, `import.complete`, `import.fail`, `import.retry`, `import.cancel` (module `imports`, outcome `.success/.failure`); never-throw (HG-13).
- **FR-021**: Events via `@nestjs/event-emitter` (HG-9): ImportStarted, ImportValidated, ImportCompleted, ImportFailed (job-level); CustomerImported, ProductImported, PurchaseImported (row-level). Payload includes traceability (eventId uuid, occurredAt, organizationId, userId, module `imports`, payload, state) per 07:383-395. Consumers must be idempotent (07:375-379).
- **FR-022**: Async processing never blocks the HTTP request (API_GUIDELINES §22); processor runs in-process with per-batch DB status checks to honor cancels (US8).
- **FR-023**: File retention: files kept 30 days (deletion hook prepared, executed by the future scheduler 08:271); jobs only soft-deleted (HG-17).
- **FR-024**: No endpoint exposes `filePath` or internal storage paths (NR-006).

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` only from JWT (API_GUIDELINES §18).
- **NR-002**: Envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8); controlled exceptions only.
- **NR-003**: No N+1: natural-key indexes preloaded per job; batch counters (R-011 pattern).
- **NR-004**: Streaming parse; memory bounded by row, not file (within the 25 MB / 50k limit, HG-4).
- **NR-005**: CSV injection sanitization (cells starting with `=`, `+`, `-`, `@`, tab/CR are neutralized); XLSX values only, formulas never evaluated (INFERENCIA — not specified, security best practice).
- **NR-006**: `filePath`/storage layout never exposed; `fileName` returned sanitized (basename).
- **NR-007**: Audit never-throw (AuditIdentityService pattern, audit.identity.service.ts:52-64).
- **NR-008**: Event consumers idempotent (07:375-379).
- **NR-009**: Dates ISO 8601 UTC (API_GUIDELINES §20-21); `createdFrom`/`createdTo` date-only = whole-day inclusive (purchases pattern, commit dca47bc).
- **NR-010**: Concurrency-safe job transition (single-row updates guarded by status predicates).
- **NR-011**: No secrets, credentials or PII in logs.

## 6. Acceptance Scenarios

- **AS-001**: XLSX customers upload → 201; job reaches COMPLETED; customers upserted by codcli; counters correct (US1/3/6).
- **AS-002**: CSV products upload → 201 → COMPLETED; products upserted by code (US1/4).
- **AS-003**: CSV purchases upload (customers+products imported first) → COMPLETED; purchases created; duplicate CP-005 tuples skipped (US5).
- **AS-004**: Structural error (missing required column) → FAILED with errors and correct status transitions (US2).
- **AS-005**: Same file uploaded twice → 409 on the second (IM-005, US10).
- **AS-006**: Same request repeated with Idempotency-Key → 200 with the existing job (US10).
- **AS-007**: Customer already exists → updated, not duplicated (CL-003); phone updated (US3).
- **AS-008**: Purchase row with unknown codcli/code → row error; job PARTIAL; remaining rows processed (US7).
- **AS-009**: Row error does not stop processing; COMPLETED when 0 errors, PARTIAL otherwise (IM-006, US7).
- **AS-010**: Order customers → products → purchases within a single file upload per type (IM-001, US3/4/5).
- **AS-011**: Cancel a PROCESSING job → CANCELLED; final-state cancel → 400 (US8).
- **AS-012**: Retry a PARTIAL job → only error rows reprocessed; job COMPLETED; duplicates not created (US9).
- **AS-013**: List with type/status/date filters and pagination (US6).
- **AS-014**: Detail of another organization's job → 404 IMPORT_NOT_FOUND (HG-12).
- **AS-015**: PLATFORM_OWNER creates with valid organizationId → ok; without → 400; ORGANIZATION user sending organizationId → 400 (FR-017).
- **AS-016**: OPERADOR create/cancel/retry → 403; list/detail → 200 (HG-11).
- **AS-017**: Second active job of same type → 409 (HG-16).
- **AS-018**: File > 25 MB → 413; wrong extension/MIME → 415 (FR-002).
- **AS-019**: Audit rows exist for create/start/complete/fail/retry/cancel (FR-020).
- **AS-020**: Events emitted: ImportCompleted + PurchaseImported with traceability payload (FR-021).
- **AS-021**: Quantity above int4 max → row error (FR-010, purchases R-011).
- **AS-022**: `filePath` not present in any response (NR-006).
- **AS-023**: CSV cell starting with `=` is stored neutralized (NR-005).
- **AS-024**: `createdFrom`/`createdTo` date-only filters include the whole day (NR-009).

## 7. Out of Scope (v1)

- Automations / commercial cycles (AU-001, AU-003) — HG-10 deferred.
- BullMQ/Redis/worker app — HG-3 (08:261 future).
- S3/MinIO storage — HG-14 (08:331-336 future).
- Preview/confirmation API phases — HG-6 (UI-side).
- Error report downloads — HG-6 (optional future).
- Scheduler-based file purge — HG-17 hook only (08:271 future).
- Dashboard indicators / admin notifications on ImportCompleted (07:306-313) — future consumers.
- Import of conversations/messages/campaigns — not in ImportType.
- `Import` model rename to ImportJob — HG-18 rejected (destructive).
- Manual POST/PATCH/GET of customers/products/purchases — already implemented in their modules.

## 8. Known Conflicts (resolved via HG)

- **C-01** (preview/confirm vs async API): 05-user-flows.md:82-89 + IM-003 "errores antes de confirmar" vs API_GUIDELINES §22 (no confirmation step). → **HG-6**: partial success, no confirmation phase; preview is UI-side.
- **C-02** (event system): 07-event-architecture.md:327 "sistema de eventos nativo de NestJS" vs 08-system-architecture.md:491-492 "EventEmitter2". → **HG-9**: `@nestjs/event-emitter` (both satisfied).
- **C-03** (naming): model `Import` (schema.prisma:288) vs "ImportJob" (API_GUIDELINES.md:448, scaffolds). → **HG-18**: DB model stays `Import`; contracts/UI use "ImportJob".

## 9. Dependency Justification (AGENTS.md)

- `@nestjs/event-emitter` (EventEmitter2): HG-9; declared official in 08-system-architecture.md:491-492; required to emit ImportStarted/Validated/Completed/Failed + row events (07:244-254,74,156,164).
- XLSX parser (exceljs — streaming support, no formula evaluation): HG-2 (XLSX format explicitly in 05-user-flows.md:84).
- CSV parser (csv-parse or papaparse): HG-2 (CSV supported per 08:327-329).
- multer (already available via @nestjs/platform-express): multipart upload with size limit enforcement.