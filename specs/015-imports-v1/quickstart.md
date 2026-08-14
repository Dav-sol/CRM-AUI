# Imports v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}`, `{ORG_UUID}` (PLATFORM_OWNER only) as needed.

## S1 — Upload customers (XLSX, happy path)

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=CUSTOMERS" -F "file=@clientes.xlsx"
# 201 { data: { uuid, status: "PENDING", ... } }
```

Poll S6 until `COMPLETED`; customers upserted by `codcli` (CL-003, AS-001).

## S2 — Upload products (CSV)

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=PRODUCTS" -F "file=@productos.csv"
# 201, then COMPLETED; products upserted by code (AS-002)
```

## S3 — Upload purchases (CSV)

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=PURCHASES" -F "file=@compras.csv"
# 201, then COMPLETED; CP-005 duplicates skipped (AS-003)
```

## S4 — Structural validation failure

Upload a CSV missing a required column → job FAILED; `errorsSummary.samples` shows structural errors (AS-004).

## S5 — Duplicate file → 409

Re-upload the exact same file bytes → `409 DUPLICATE_FILE` (IM-005, AS-005).

## S6 — Idempotency-Key replay

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: import-abc-1" \
  -F "type=CUSTOMERS" -F "file=@clientes.xlsx"
# repeat same request+key → 200 with the SAME job (FR-005, AS-006)
```

## S7 — Job status polling

```bash
curl -s http://localhost:3000/api/v1/imports/{uuid} -H "Authorization: Bearer $TOKEN"
# { data: { status: "PROCESSING", processedRecords, errorRecords, ... } }
```

## S8 — Row-level error → PARTIAL

Purchase row with unknown `codcli` → row in `errorsSummary.samples`, job finishes `PARTIAL`, rest processed (IM-006, AS-008/009).

## S9 — Cancel

```bash
curl -s -X POST http://localhost:3000/api/v1/imports/{uuid}/cancel -H "Authorization: Bearer $TOKEN"
# 200 { data: { status: "CANCELLED", success: true } } (AS-011)
# cancel of a COMPLETED job → 400
```

## S10 — Retry partial job

```bash
curl -s -X POST http://localhost:3000/api/v1/imports/{uuid}/retry -H "Authorization: Bearer $TOKEN"
# 200 { data: { status: "PROCESSING", success: true } }; only error rows reprocessed; no duplicates (AS-012)
```

## S11 — List with filters

```bash
curl -s "http://localhost:3000/api/v1/imports?type=CUSTOMERS&status=PARTIAL&createdFrom=2026-08-01&createdTo=2026-08-14&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
# { data: [...], meta: { page, limit, total, pages } }
```

## S12 — Cross-tenant detail → 404

Request another organization's job uuid → `404 IMPORT_NOT_FOUND` (HG-12, AS-014).

## S13 — PLATFORM_OWNER organizationId

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=PRODUCTS" -F "organizationId=$ORG_UUID" -F "file=@productos.csv"
# ok; without organizationId → 400 VALIDATION_ERROR; ORGANIZATION user sending it → 400 (AS-015)
```

## S14 — Role enforcement

OPERADOR token: POST/cancel/retry → `403 FORBIDDEN`; GET list/detail → 200 (HG-11, AS-016).

## S15 — Concurrency

Two concurrent uploads of the same type → second `409 IMPORT_ACTIVE` (HG-16, AS-017).

## S16 — Limits & safety

File > 25 MB → `413 PAYLOAD_TOO_LARGE`; wrong extension/MIME → `415 UNSUPPORTED_MEDIA_TYPE` (AS-018). CSV cell starting with `=` stored neutralized (AS-023). `filePath` never in responses (AS-022).

## Audit & events (verification)

- Audit rows: `imports` module with `import.create/start/complete/fail/retry/cancel` outcomes (AS-019).
- Events: ImportStarted/ImportValidated/ImportCompleted/ImportFailed + CustomerImported/ProductImported/PurchaseImported with traceability payload (AS-020).