# Automatizaciones v1 — API Contract (contract-first)

Base path: `/api/v1/automations` and `/api/v1/commercial-cycles`. All responses use the standard envelope `{ data }`, `{ data, meta }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). All endpoints require `Authorization: Bearer <JWT>`.

## Shared shapes

```ts
type AutomationStatus = 'PENDING' | 'SCHEDULED' | 'EXECUTED' | 'CANCELLED' | 'ERROR' | 'PAUSED';
type CommercialCycleStatus = 'ACTIVE' | 'FINISHED' | 'CANCELLED';

interface AutomationSummary {
  uuid: string;
  status: AutomationStatus;
  scheduledDate: string;        // ISO 8601 UTC
  executedDate: string | null;
  priority: number;
  purchaseId: string;           // purchase uuid
  commercialCycleId: string;    // cycle uuid
  createdAt: string;
}

interface AutomationDetail extends AutomationSummary {
  organizationId: string;
  campaignId: string | null;
  purchase: { uuid: string; invoiceNumber: string; purchaseDate: string; productName: string };
  customer: { uuid: string; fullName: string; phone: string | null };
}

interface CommercialCycleSummary {
  uuid: string;
  status: CommercialCycleStatus;
  startDate: string;            // ISO 8601 UTC
  endDate: string | null;
  purchaseId: string;           // purchase uuid
  createdAt: string;
}

interface CommercialCycleDetail extends CommercialCycleSummary {
  automations: AutomationSummary[];
}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
```

Internal fields (`organizationId` internals, full relations) are NOT exposed beyond the shapes above (NR-006/API_GUIDELINES §6-8).

## GET /commercial-cycles — list cycles

- Roles: all authenticated (Q11)
- Query: `page` (default 1), `limit` (default 20, max 100), `status` (ACTIVE|FINISHED|CANCELLED), `customerId` (customer uuid), `purchaseId` (purchase uuid), `createdFrom` (date-only, inclusive whole day), `createdTo` (inclusive), `sort` (whitelist: `-createdAt` default, `createdAt`, `-startDate`)
- Tenant-scoped via the purchase's organization (R-005)

200 OK:

```json
{ "data": [ /* CommercialCycleSummary[] */ ], "meta": { "page": 1, "limit": 20, "total": 2, "pages": 1 } }
```

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`.

## GET /commercial-cycles/{uuid} — cycle detail

- Roles: all authenticated
- Cross-tenant or unknown → `404 COMMERCIAL_CYCLE_NOT_FOUND`

200 OK:

```json
{ "data": { "uuid": "…", "status": "ACTIVE", "startDate": "…", "endDate": null, "purchaseId": "…", "automations": [ /* AutomationSummary[] */ ], "createdAt": "…" } }
```

Errors: `401`, `403`, `404 COMMERCIAL_CYCLE_NOT_FOUND`.

## GET /automations — list automations

- Roles: all authenticated
- Query: `page`, `limit` (max 100), `status`, `commercialCycleId` (cycle uuid), `customerId` (customer uuid), `scheduledFrom` (date-only, inclusive whole day), `scheduledTo` (inclusive), `sort` (whitelist: `-scheduledDate` default, `scheduledDate`, `-createdAt`, `createdAt`, `-status`)

200 OK:

```json
{ "data": [ /* AutomationSummary[] */ ], "meta": { "page": 1, "limit": 20, "total": 3, "pages": 1 } }
```

Errors: `401`, `403`.

## GET /automations/{uuid} — automation detail

- Roles: all authenticated
- Cross-tenant or unknown → `404 AUTOMATION_NOT_FOUND`

200 OK:

```json
{ "data": { /* AutomationDetail */ } }
```

Errors: `401`, `403`, `404 AUTOMATION_NOT_FOUND`.

## POST /automations/{uuid}/cancel — cancel automation

- Roles: PLATFORM_OWNER, ADMINISTRADOR, GERENTE (Q11)
- Only PENDING/SCHEDULED → CANCELLED (AU-002, AU-004); EXECUTED/CANCELLED/PAUSED → 400; unknown/cross-tenant → 404

200 OK:

```json
{ "data": { "uuid": "…", "status": "CANCELLED", "success": true } }
```

Errors: `400 VALIDATION_ERROR` (not cancellable state), `401`, `403 FORBIDDEN` (OPERADOR), `404 AUTOMATION_NOT_FOUND`.

## Error codes (controlled exceptions)

`AUTOMATION_NOT_FOUND` (404), `COMMERCIAL_CYCLE_NOT_FOUND` (404), `VALIDATION_ERROR` (400), `FORBIDDEN` (403). Never leak internals (Constitution IX).