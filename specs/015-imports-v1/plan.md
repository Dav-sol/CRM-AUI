# Implementation Plan: Imports v1

**Branch**: `main` | **Date**: 2026-08-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-imports-v1/spec.md`; domain requirements from `specs/04-domain-model.md` (Importación, Agregado Importación), `specs/06-database.md` (Import, Soft Delete, Restricciones), `specs/02-modules.md` (Módulo 04 — Importador), `specs/03-business-rules.md` (IM-001..IM-006, CL-003, CP-005, AD-003), `specs/05-user-flows.md` (Flujo 02/03), `specs/07-event-architecture.md` (ImportStarted/ImportValidated/ImportCompleted/ImportFailed, CustomerImported, ProductImported, PurchaseImported, idempotencia de consumidores, trazabilidad), `specs/08-system-architecture.md` (Almacenamiento local, Colas futuras, escala), `specs/api/API_GUIDELINES.md` (§18 tenant, §19 Idempotency-Key, §22 importaciones asíncronas), approved decisions HG-1..HG-18 (2026-08-14)

## Summary

Imports v1 implements the Importador module: asynchronous file upload (XLSX + CSV) of customers, products and purchases with structural validation, row-level partial-success processing (upsert by natural key), import job tracking with counters and row errors, cancel/retry, tenant isolation, roles, audit and domain events via `@nestjs/event-emitter`. The `Import` Prisma model already exists (migration `20260810000529_add_domain_entities`); the module adds an additive migration (actor fields, `file_hash` + unique, `[organizationId, status]` index, `CANCELLED` enum value). Processing is asynchronous in-process (HG-3); BullMQ/Redis and the Automations module remain future (HG-10).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, @nestjs/config + joi (env validation). **New dependencies (approved HG-2/HG-9, to justify in research.md)**: `@nestjs/event-emitter` (EventEmitter2 — 08-system-architecture.md:491-492); XLSX parser (exceljs or xlsx) + CSV parser (csv-parse/papaparse). File upload via `@nestjs/platform-express` + multer (already a dependency).

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), model `Import` (schema.prisma:288-314), enums `ImportType {CUSTOMERS, PURCHASES, PRODUCTS}` (schema.prisma:507-511) and `ImportStatus {PENDING, VALIDATING, PROCESSING, COMPLETED, FAILED, PARTIAL}` (schema.prisma:513-520). Files on local filesystem under `uploads/org-{id}/` (HG-14, 08-system-architecture.md:331-336).

**Testing**: Jest + ts-jest (unit: `*.spec.ts` under `src`; e2e: supertest via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: No N+1 — preload natural-key indexes (`codcli`, `code`, purchase tuples) per job; streaming parse (memory bounded by row, not file); per-row short transactions; counters updated per batch; scale v1 = 50k customers, 1M automations (08-system-architecture.md:420-429), 25 MB / 50.000 rows per file (HG-4).

**Constraints**:
- Tenant isolation: `organizationId` never trusted from client (API_GUIDELINES §18); always from JWT; PLATFORM_OWNER sends validated `organizationId` on POST; ORGANIZATION users sending it → 400 (HG-12, precedent customers/products)
- Cross-tenant job access → 404 `IMPORT_NOT_FOUND` (HG-12, precedent R-002); role denials → 403
- `TenantScopeGuard` MUST NOT be used (precedent R-001 purchases); tenant enforcement lives in the service layer
- No Zod; class-validator DTOs only (precedent)
- Async in-process processing (HG-3, API_GUIDELINES §22): the HTTP request never blocks on file processing; job progresses PENDING → VALIDATING → PROCESSING → COMPLETED | PARTIAL | FAILED | CANCELLED
- Idempotency (HG-5): `file_hash` (SHA-256) unique per (organizationId, fileHash) + `Idempotency-Key` header (API_GUIDELINES §19)
- Ordering (HG-7, IM-001): customers → products → purchases; purchase rows referencing missing customers/products become row errors (IM-006), never abort the job
- ERP authority (HG-8, CL-003/CP-005): upsert by natural key — customer `codcli`, product `code`, purchase tuple (organizationId, invoiceNumber, customerId, productId, purchaseDate); immutable keys: `codcli`, `code`, `invoiceNumber`
- Errors (HG-6, IM-006): partial success; row errors recorded in `errors` JSON with row/field/message; no rollback of already-processed rows; no API confirmation phase (C-01 resolved — preview is UI-side)
- Concurrency (HG-16): 1 active job per (organizationId, type) → 409 on conflict
- Retry (HG-15): only FAILED/PARTIAL; same job record returns to PROCESSING reprocessing only the rows previously in error (errors JSON retained until completion); audit `import.retry`
- Cancel (HG-16/FR): only PENDING/VALIDATING/PROCESSING → CANCELLED (new enum value, additive ALTER TYPE)
- Events (HG-9): `@nestjs/event-emitter`; emit `ImportStarted`, `ImportValidated`, `ImportCompleted`, `ImportFailed` + per-row `CustomerImported`, `ProductImported`, `PurchaseImported`; payloads with traceability (07-event-architecture.md:383-395); consumers idempotent (07:375-379). Automations deferred (HG-10)
- Audit (HG-13): `import.create/.start/.complete/.fail/.retry/.cancel` with `.success/.failure` via `AuditIdentityService` (never-throw, audit.identity.service.ts:52-64)
- Existing modules are NOT modified; the only cross-module touches are `app.module.ts` registration of `ImportsModule` and the future OpenAPI root wiring; customers/products/purchases services are reused for writes OR the import processor writes via Prisma with the same invariants (uniqueness P2002 backstops — see research.md R-008)
- Response envelope `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- `filePath` and internal storage paths NEVER exposed in API responses (NR-006)
- Dates: ISO 8601 UTC (API_GUIDELINES §20-21)

**Scale/Scope**: Imports v1 only — upload (XLSX/CSV), validation, asynchronous processing of customers/products/purchases, job tracking (status, counters, errors), cancel, retry, list/detail, idempotency, tenant isolation, roles, audit, domain events. OUT: Automations/AU-001 (HG-10), BullMQ/Redis/worker (HG-3), S3 (HG-14), report downloads, preview/confirmation API phases (HG-6), scheduler-based file purge (HG-17 — hook prepared, scheduler is future 08:271).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (Módulo 04 Importador, IM-001..006, flujos 02/03, Import model, eventos) + `specs/015-imports-v1/spec.md`; conflicts C-01/C-02/C-03 recorded and resolved via HG-6/HG-9/HG-18 |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service -> Processor) mirroring the approved module pattern; async in-process processing justified by API_GUIDELINES §22 (HG-3); no new architecture beyond the sanctioned event emitter |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/imports-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; cross-tenant → 404 IMPORT_NOT_FOUND; PLATFORM_OWNER validated organizationId; storage scoped per org; processor always executes in the job's organization scope |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles and guards (JwtAuthGuard, RolesGuard); writes = PLATFORM_OWNER + ADMINISTRADOR + GERENTE, reads = all roles (HG-11) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all import endpoints; no new token/session logic |
| VII. IDENTITY FLOWS | PASS | Not applicable; audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE approved (HG-18/HG-5)**: strictly additive migration — nullable actor columns, `file_hash` + unique index, `[organizationId, status]` index, `ALTER TYPE ADD VALUE 'CANCELLED'`; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; file validation (MIME/extension/size, NR-005); CSV injection sanitization; controlled exceptions (IMPORT_NOT_FOUND, CONFLICT, VALIDATION_ERROR, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE); audit metadata sanitized; no secrets/PII in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Imports v1 + `@nestjs/event-emitter` infrastructure (HG-9); existing modules untouched except app.module registration; Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-18 approved verbatim on 2026-08-14 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-18 approved on 2026-08-14 (alcance customers+products+purchases; XLSX+CSV; asíncrono en-proceso; 25MB/50.000 filas; file_hash+Idempotency-Key; partial success sin confirmación API; orden clientes→productos→compras con falla por fila; upsert por clave natural; eventos @nestjs/event-emitter; AU-001 diferido; writes PO+ADMIN+GERENTE y lectura todos; patrón tenant existente; auditoría patrón products + retry/cancel; storage local; retry solo filas con error; 1 activo por type+org; soft delete + archivo 30 días; kit 015/T121+ y modelo `Import` sin rename).
