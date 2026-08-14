# Imports v1 — Research Notes

## R-001 — Import model exists (schema.prisma:288-314)

`model Import` already exists with `id`, `uuid`, `organizationId`, `userId`, `type`, `fileName`, `filePath`, `status`, `totalRecords`, `processedRecords`, `errorRecords`, `errors Json?`, `startedAt`, `completedAt`, `createdAt`, `updatedAt`, `deletedAt`; relations `organization`/`user`; indexes `[organizationId]`, `[userId]`, `[status]`. Created in migration `20260810000529_add_domain_entities`. **Missing for v1**: actor fields (`createdBy`/`updatedBy`/`deletedBy`), idempotency storage (`file_hash`/`idempotency_key`), compound index `[organizationId, status]`, `CANCELLED` status.

## R-002 — Enums (schema.prisma:507-520)

`ImportType {CUSTOMERS, PURCHASES, PRODUCTS}` — supports HG-1 as approved, no enum change. `ImportStatus {PENDING, VALIDATING, PROCESSING, COMPLETED, FAILED, PARTIAL}` — needs `CANCELLED` (HG cancel FR-006); additive `ALTER TYPE ... ADD VALUE 'CANCELLED'`.

## R-003 — Event infrastructure does not exist

No `EventEmitterModule`, `@nestjs/event-emitter`, `EventEmitter2`, BullMQ or Redis client anywhere in `apps/api` (grep runtime empty). 08-system-architecture.md:491-492 declares EventEmitter2 official; 07:327 declares "primera versión utilizará el sistema de eventos nativo de NestJS" → `@nestjs/event-emitter` resolves both (HG-9).

## R-004 — No queue/worker/storage infrastructure

`apps/` contains only `api` (+coverage); no `apps/worker` (08:131-132 future); no uploads directory; no multer config. Storage = local filesystem to create under `uploads/` (HG-14, 08:331-336). `dist` is gitignored (repo root .gitignore:5) — an uploads dir must also be gitignored.

## R-005 — Tenant enforcement pattern (precedent)

`TenantScopeGuard` MUST NOT be used (purchases R-001 precedent); tenant enforcement lives in the service layer (`findScoped` pattern, products.service.ts). Cross-tenant access → 404 (customers R-002 / purchases R-002 / products `PRODUCT_NOT_FOUND`). PLATFORM_OWNER requires validated `organizationId` on writes; ORGANIZATION users sending `organizationId` → 400 (products.service.ts:299-340).

## R-006 — Role pattern (precedent)

Writes: `@Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE')` (products.controller.ts:48-66); OPERADOR read-only. Guards: `apps/api/src/core/guards/{jwt-auth,roles,tenant-scope}.guard.ts` + `core/decorators/roles.decorator.ts`. HG-11 extends reads to all roles (list/detail).

## R-007 — Audit pattern (precedent)

`AuditIdentityService.record({module, action, outcome, userId, organizationId, description, metadata})` never-throws (audit.identity.service.ts:52-64); action string = `{action}.{outcome}` (e.g. `product.create.success`); metadata sanitized. Products module uses `module: 'products'`, actions `product.create|update|delete`. Imports v1: `module: 'imports'`, actions `import.create|start|complete|fail|retry|cancel` (HG-13).

## R-008 — Upsert invariants (precedent)

Customers: unique `(organizationId, codcli)` (schema.prisma:105); products: unique `(organizationId, code)` (:131); purchases: unique `(organizationId, invoiceNumber, customerId, productId, purchaseDate)` (:160, CP-005). Existing services pre-check then P2002 backstop. The import processor can write via Prisma directly with the same invariants (preload natural-key sets per job to avoid N+1, NR-003) — avoids cross-module service coupling (AGENTS.md event/module discipline); P2002 → treat as duplicate/skip, never 500.

## R-009 — Quantity/value validation (precedent)

Purchases cap quantity at int4 max (commit dca47bc); value is a decimal string (`^\d{1,10}(\.\d{1,2})?$`, CreatePurchaseRequest contract). Import rows must apply identical rules → row errors (FR-010, AS-021).

## R-010 — Async in-process processing (design)

API_GUIDELINES §22 mandates async; no queue infra exists (R-004). Design: POST persists file + job (PENDING), then schedules processing in-process (fire-and-forget with lifecycle binding; a dedicated `ImportsProcessor` service). Processor advances VALIDATING → PROCESSING, checks DB status between batches to honor cancels (FR-022), updates counters transactionally per batch. **INFERENCIA** (mechanism not prescribed for v1); future: swap to BullMQ (08:261) without changing the pipeline.

## R-011 — Batch/counters (design)

`totalRecords` known after VALIDATING (row count); `processedRecords`/`errorRecords` incremented per row/batch; final update sets status + `completedAt` in one transaction. `errors` JSON capped (100 samples + total, FR-011) to bound payload size.

## R-012 — Idempotency (design)

`file_hash` = SHA-256 computed during upload; unique index `(organizationId, file_hash)` → 409 on second upload (IM-005, FR-004). `Idempotency-Key` header stored in `idempotency_key` column (nullable, no unique index — replay scope is per organization+user, looked up on demand, FR-005; API_GUIDELINES §19). Postgres unique allows multiple NULLs → jobs without hash/key unaffected.

## R-013 — CSV injection / XLSX safety (design, INFERENCIA)

Cells starting with `=`, `+`, `-`, `@`, tab, CR neutralized (prefix `'` or strip) before persistence (NR-005, AS-023). XLSX parsed with exceljs in value-only mode; formulas not evaluated; macros not executed; only the first worksheet used.

## R-014 — Storage layout (design)

`uploads/org-{organizationId}/<uuid>.<ext>`; file persisted with a random uuid name derived from the persisted file (never from user input — no path traversal); original `fileName` stored sanitized (basename only); retention 30 days with purge hook (FR-023, HG-17); uploads dir added to .gitignore.

## R-015 — OpenAPI scaffolds (state)

`specs/api/paths/imports.yaml` (0 bytes) + `specs/api/components/schemas/ImportJob/` (7 files, 0 bytes: ImportJob, ImportJobDetails, ImportJobListResponse, ImportJobResponse, ImportJobSummary, CreateImportJobRequest, UpdateImportJobRequest). Tag `Imports` already defined (info/tags.yaml:19). Root openapi.yaml (a3ffbf8) wires paths via per-path `$ref` with `~1`-escaped JSON pointers; validation chain: `api:lint` (redocly --config .redocly.yaml) + `api:spectral` (bundles to dist then lints). New import paths must follow the same wiring + re-run `api:validate`.

## R-016 — SDK/orval state

`orval.config.ts` targets `packages/sdk` which does not exist; `api:generate` has never been run and is out of scope for Imports v1 (report only).

## R-017 — Test infrastructure (state)

Unit: 169/169 (17 suites, `npx jest src/modules/products` pattern); e2e: 84/84 (8 suites, jest-e2e.json `--runInBand`); combined 253/253; coverage target >80% per module (Constitution X, jest-combined.json). Imports suites: `imports.service.spec.ts`, `imports.processor.spec.ts`, `imports.controller.spec.ts`, `imports.e2e-spec.ts` with org/role/bcrypt seed pattern (products.e2e-spec.ts).

## R-018 — Enum migration caution

`ALTER TYPE "public"."ImportStatus" ADD VALUE 'CANCELLED'` inside a Prisma migration: on PostgreSQL ≥ 12 this is allowed in a transaction; verify server version (localhost:5433) before apply; if the version forbids it, apply the enum change outside the transaction block. Migration must remain strictly additive (HG-18).

## R-019 — Natural key preload (performance)

Per job: one query per key type — `SELECT codcli FROM customers WHERE organizationId = X AND deletedAt IS NULL` (or active set), `SELECT code FROM products WHERE organizationId = X AND deletedAt IS NULL`, `SELECT invoiceNumber, customerId, productId, purchaseDate FROM purchases WHERE organizationId = X`. Then per row decide insert/update/skip in memory (NR-003). For 50k rows this is one pass per key, not 50k queries.

## R-020 — Retry semantics (design)

Retry reuses the same job row: FAILED/PARTIAL → PROCESSING, `startedAt` refreshed, `completedAt` cleared, counters reset to the pre-error baseline? (No — counters must reflect current attempt; reset processed/error to 0 and reprocess ONLY rows listed in `errors` at retry time; `errors` retained until completion so a failed retry can be retried again). All writes idempotent (R-008) → no duplicates (FR-014, AS-012).
