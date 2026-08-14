# Imports v1 — API Contract (contract-first)

Base path: `/api/v1/imports`. All responses use the standard envelope `{ data }`, `{ data, meta }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). All endpoints require `Authorization: Bearer <JWT>`.

## Shared shapes

```ts
type ImportType = 'CUSTOMERS' | 'PURCHASES' | 'PRODUCTS';
type ImportStatus = 'PENDING' | 'VALIDATING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'CANCELLED';

interface ImportJob {
  uuid: string;
  type: ImportType;
  status: ImportStatus;
  fileName: string;          // original basename, sanitized (NR-006)
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  errorsSummary: { total: number; samples: ErrorSample[] }; // samples capped at 10
  startedAt: string | null;  // ISO 8601 UTC
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ErrorSample {
  row: number;        // file row number (1-based)
  field: string;
  message: string;
  raw?: string;       // sanitized original value (capped 200 chars)
}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
```

`filePath`, `errors` (full), internal storage paths are NEVER in responses (NR-006, FR-024).

## POST /imports — create job (multipart)

- Roles: PLATFORM_OWNER, ADMINISTRADOR, GERENTE (HG-11)
- Content-Type: `multipart/form-data`; fields: `file` (binary, required), `type` (enum, required)
- Header: `Idempotency-Key: <string>` (optional, API_GUIDELINES §19)
- PLATFORM_OWNER additionally sends `organizationId` (validated, required); ORGANIZATION users sending it → 400 (HG-12)
- Validation order: auth → role → tenant → format (MIME/extension/magic, FR-002) → limits (≤25 MB → else 413; ≤50.000 rows → job FAILED with structural error after parse) → Idempotency-Key replay (200 with existing job) → `file_hash` duplicate (409, IM-005) → active-job concurrency (409, HG-16)

201 Created:

```json
{ "data": { "uuid": "…", "type": "CUSTOMERS", "status": "PENDING", "fileName": "clientes.xlsx", "totalRecords": 0, "processedRecords": 0, "errorRecords": 0, "errorsSummary": { "total": 0, "samples": [] }, "startedAt": null, "completedAt": null, "createdAt": "…", "updatedAt": "…" } }
```

200 (Idempotency-Key replay, FR-005): same body with the existing job.

Errors: `400 VALIDATION_ERROR` (missing/invalid fields, invalid `type`, unsupported role shape, PLATFORM_OWNER with unknown `organizationId`), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 IMPORT_ACTIVE` (concurrent same-type job, HG-16) / `409 DUPLICATE_FILE` (IM-005, FR-004), `413 PAYLOAD_TOO_LARGE` (>25 MB, FR-002), `415 UNSUPPORTED_MEDIA_TYPE` (bad extension/MIME, FR-002).

## GET /imports — list jobs

- Roles: all authenticated (HG-11)
- Query: `page` (default 1), `limit` (default 20, max 100), `type`, `status`, `createdFrom` (date-only, inclusive whole day), `createdTo` (inclusive), `search` (fileName contains, case-insensitive), `sort` (whitelist: `-createdAt`, `createdAt`, `-status`, `-updatedAt`; default `-createdAt`)

200 OK:

```json
{ "data": [ /* ImportJob[] */ ], "meta": { "page": 1, "limit": 20, "total": 3, "pages": 1 } }
```

## GET /imports/{uuid} — job detail

- Roles: all authenticated
- Cross-tenant or unknown → `404 IMPORT_NOT_FOUND` (HG-12, FR-016)

200 OK:

```json
{ "data": { /* ImportJob with errorsSummary */ } }
```

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 IMPORT_NOT_FOUND`.

## POST /imports/{uuid}/cancel — cancel job

- Roles: PLATFORM_OWNER, ADMINISTRADOR, GERENTE
- Only PENDING/VALIDATING/PROCESSING → CANCELLED; final states → 400

200 OK:

```json
{ "data": { "uuid": "…", "status": "CANCELLED", "success": true } }
```

Errors: `400 VALIDATION_ERROR` (job in final state), `401`, `403`, `404 IMPORT_NOT_FOUND`.

## POST /imports/{uuid}/retry — retry job

- Roles: PLATFORM_OWNER, ADMINISTRADOR, GERENTE
- Only FAILED/PARTIAL → PROCESSING, reprocessing only previously failed rows (HG-15); other states → 400

200 OK:

```json
{ "data": { "uuid": "…", "status": "PROCESSING", "success": true } }
```

Errors: `400 VALIDATION_ERROR` (not retryable state), `401`, `403`, `404 IMPORT_NOT_FOUND`, `409 IMPORT_ACTIVE` (another active job of same type started meanwhile, HG-16).

## Error codes (controlled exceptions)

`IMPORT_NOT_FOUND` (404), `IMPORT_ACTIVE` (409), `DUPLICATE_FILE` (409), `VALIDATION_ERROR` (400), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415). Never leak internals (Constitution IX).
