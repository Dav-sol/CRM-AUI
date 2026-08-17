# Campaigns v1 — API Contract (contract-first)

Base path: `/api/v1/campaigns`. All REST responses use the standard envelope `{ data }`, `{ data, meta }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). All REST endpoints require `Authorization: Bearer <JWT>`.

This contract **extends** the kit 017 contract (`specs/017-whatsapp-v1/contracts/whatsapp-api.md`) and the kit 018 conversations contract (`specs/018-conversations-inbox-v1/contracts/conversations-inbox-api.md`): the shapes below add the campaign fields; existing shapes are unchanged.

## 1. Shared shapes

```ts
interface AdvisorRef {
  uuid: string;
  firstName: string;
  lastName: string;
}

interface CustomerRef {
  uuid: string;
  name: string;
  phone: string | null;   // masked in responses, never logged
}

interface CampaignSegmentDto {
  city?: string;            // max 200 chars, partial case-insensitive (consistent with customers list)
  productId?: string;       // product uuid, max 64 chars
  purchaseFrom?: string;    // ISO date (YYYY-MM-DD), whole-day inclusive (NR-010)
  purchaseTo?: string;      // ISO date (YYYY-MM-DD), whole-day inclusive
  customerStatus?: CustomerStatus; // ACTIVE | INACTIVE | BLOCKED
}

interface CampaignSummary {
  uuid: string;
  name: string;
  description?: string;
  type?: CampaignType;
  status: CampaignStatus;
  startAt?: string;         // ISO 8601 UTC
  segment?: CampaignSegmentDto | null;
  automationCount: number;  // total SCHEDULED automations generated
  executedCount: number;    // total EXECUTED automations
  createdAt: string;
}

interface CampaignDetail extends CampaignSummary {}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Re-used from 017
enum CampaignType {
  AUTOMATIC
  MANUAL
  REPURCHASE
  SPECIAL
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  FINISHED
  CANCELLED
}

enum CustomerStatus {
  ACTIVE
  INACTIVE
  BLOCKED
}

interface CreateCampaignDto {
  name: string;                 // required, 1..120 chars
  description?: string;         // optional, max 1000 chars
  type: CampaignType;           // required, informational in v1
  template: string;             // required, 1..4096 chars; free text with {customerName}/{productName}/{organizationName} placeholders
  segment?: CampaignSegmentDto; // optional, ≥1 criterion
  startAt?: string;             // ISO date-time, optional
}

interface UpdateCampaignDto {
  name?: string;                // optional, PATCH only in DRAFT (FR-004)
  description?: string;         // optional, PATCH only in DRAFT
  template?: string;            // optional, PATCH only in DRAFT
  segment?: CampaignSegmentDto; // optional, PATCH only in DRAFT; ≥1 of the above criteria or empty → 400
  type?: CampaignType;          // optional, PATCH only in DRAFT
  startAt?: string;             // optional, PATCH only in DRAFT
  // at least one field required
}

interface ActivateCampaignDto {
  // No body; activation uses campaign.startAt and stored segment.
  // Empty body required for POST convention.
}

interface PauseCampaignDto {
  // No body; pause only (FR-007)
}

interface ResumeCampaignDto {
  // No body; resume only (FR-008)
}

interface CancelCampaignDto {
  // No body; cancel only (FR-009)
}

interface SegmentPreviewResponse {
  count: number;  // qualifying customers count; dry-run, no automations created
  // no PII returned
}

interface AutomationExecutedPayload {
  automationId: string;
  purchaseId: string;
  executedAt: string;
  status: 'EXECUTED';
  campaignId?: string;
}
```

## 2. POST /campaigns — create

- Roles: all authenticated (HG-3) — JwtAuthGuard only, no `@Roles`
- Body: `CreateCampaignDto` — at least name + type + template required; segment optional; if segment present, ≥1 of its fields required (INFERENCIA); startAt optional.
- Behavior: save as DRAFT; emit `CampaignCreated` (07:200-210); audit `campaign.create`. Include organizaitonId from JWT.
- 201 Created:

```json
{ "data": { "uuid": "…", "name": "…", "status": "DRAFT", "organizationId": "…", "createdAt": "…" } }
```

Errors: `400 VALIDATION_ERROR` (missing required fields, segment ≥1 criterion), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 CAMPAIGN_NAME_EXISTS` (if name uniqueness enforced at DB level; INFERENCIA: no UNIQUE constraint in v1 — documented as future).

## 3. GET /campaigns — list

- Roles: all authenticated (HG-3)
- Query params: `page`/`limit` (≤100, default 20), `sort` whitelist (`-createdAt` default, `createdAt`, `updatedAt`, `name`, `status`, `type`, `startAt`), `status?`, `type?`, `search?` (name contains, case-insensitive).
- Row shape: `CampaignSummary` with `automationCount` and `executedCount` (computed via `groupBy` on automations table; no N+1, NR-003).
- Tenant-scoped via `organizationId`; cross-tenant rows never returned.
- 200 OK:

```json
{ "data": [ /* CampaignSummary[] */ ], "meta": { "page": 1, "limit": 20, "total": 4, "pages": 4 } }
```

Errors: `401`, `403`.

## 4. GET /campaigns/{uuid} — detail

- Roles: all authenticated (HG-3)
- `CampaignDetail` (full config + segment + `automationCount`/`executedCount`); cross-tenant/unknown → `404 CAMPAIGN_NOT_FOUND`.
- 200 OK:

```json
{ "data": { /* CampaignDetail */ } }
```

Errors: `401`, `403`, `404 CAMPAIGN_NOT_FOUND`.

## 5. PATCH /campaigns/{uuid} — update (DRAFT only)

- Roles: all authenticated (HG-3)
- PATCH only allowed when campaign status = DRAFT; else `400 VALIDATION_ERROR` (campaign already transitioned, `CAMPAIGN_INVALID_STATE`).
- Body: `UpdateCampaignDto` — at least one field; only name/description/template/segment/type/startAt permitted.
- Validation: segment, if present, must have ≥1 criterion; otherwise `400 VALIDATION_ERROR`.
- Behavior: update fields; emit `CampaignUpdated`, audit `campaign.update`.
- 200 OK:

```json
{ "data": { "uuid": "…", "name": "…", "status": "DRAFT" } }
```

Errors: `400 VALIDATION_ERROR` (already ACTIVE/PAUSED/FINISHED/CANCELLED; segment ≥1 required), `401`, `403`, `404 CAMPAIGN_NOT_FOUND`.

## 6. POST /campaigns/{uuid}/activate — activate

- Roles: all authenticated (HG-3)
- No request body (Activates the stored campaign config).
- Behavior:
  1. Guard `status = DRAFT` (single-row update; concurrent second activation → 400 `VALIDATION_ERROR`).
  2. Resolve segment against org purchases (city product purchaseFrom/purchaseTo customerStatus; dedupe customers, most recent purchase first).
  3. Validate count against `MAX_AUTOMATIONS_PER_CAMPAIGN` (constant, default 5.000); over → `400 SEGMENT_TOO_LARGE`, cancel the DRAFT→ACTIVE guard, campaign stays DRAFT.
  4. Batch-create automations (500/batch) in the same transaction: `organizationId`, `purchaseId` (deduped per-customer most recent), `campaignId`, `scheduledDate = max(startAt, now)`, `status = SCHEDULED`, `priority = 0`.
  5. Audit `campaign.activate` + `campaign.automations.generated`; emit `CampaignActivated` (with `automationCount`, `startedAt`).
- 200 OK:

```json
{ "data": { "uuid": "…", "status": "ACTIVE", "automationCount": 42, "startedAt": "…" } }
```

Errors: `400 VALIDATION_ERROR` (already not DRAFT; segment too large), `401`, `403`, `404 CAMPAIGN_NOT_FOUND`, `409` (should not happen due to guard).

## 7. POST /campaigns/{uuid}/pause — pause

- Roles: all authenticated (HG-3)
- Guard `status = ACTIVE` (else `400 VALIDATION_ERROR`).
- Behavior: `status = PAUSED`; emit `CampaignUpdated`, audit `campaign.pause`.
- 200 OK:

```json
{ "data": { "uuid": "…", "status": "PAUSED" } }
```

Errors: as above.

## 8. POST /campaigns/{uuid}/resume — resume

- Roles: all authenticated (HG-3)
- Guard `status = PAUSED` (else `400`).
- Behavior: `status = ACTIVE`; emit `CampaignActivated`; audit `campaign.resume`.

## 9. POST /campaigns/{uuid}/cancel — cancel

- Roles: all authenticated (HG-3)
- Guard from DRAFT/ACTIVE/PAUSED → CANCELLED (terminal); cancel all pending `SCHEDULED` automations (`updateMany` → CANCELLED); emit `CampaignCancelled`, audit `campaign.cancel`.
- 200 OK:

```json
{ "data": { "uuid": "…", "status": "CANCELLED" } }
```

Errors: as above.

## 10. POST /campaigns/{uuid}/preview-segment — dry-run

- Roles: all authenticated (HG-3)
- Body: `CampaignSegmentDto` (inherited from the campaign's stored segment, or the full segment object).
- Behavior: resolve the stored segment (or the supplied segment), count qualifying customers (AND combinator; no automations created; no PII returned). Return `{ count }`. Audit `campaign.preview_segment`.
- 200 OK:

```json
{ "data": { "count": 128 } }
```

Errors: `400 VALIDATION_ERROR` (segment has 0 criteria), `401`, `403`, `404 CAMPAIGN_NOT_FOUND`.

## 11. Error codes (controlled exceptions)

`CAMPAIGN_NOT_FOUND` (404), `VALIDATION_ERROR` (400), `SEGMENT_TOO_LARGE` (400), `FORBIDDEN` (403), `UNAUTHORIZED` (401). Never leak internals (Constitution IX). Distinct codes vs generic VALIDATION_ERROR aid client differentiation.

## 12. OpenAPI wiring

Paths `specs/api/paths/campaigns.yaml` (all 9 endpoints) + new schemas `Campaign`, `CampaignSummary`, `CampaignDetails`, `CampaignListResponse`, `CampaignResponse`, `CreateCampaignRequest`, `UpdateCampaignRequest`, `CampaignSegment`, `SegmentPreviewResponse`; tags `Campaigns` added to `info/tags.yaml` (already present); root `openapi.yaml` refs added; `npm run api:validate` green. The 017 `/conversations` GET shapes gain no additive fields (campaigns live at `/campaigns`).

## 13. Audit actions (AD-001..003)

`campaign.create`, `campaign.update`, `campaign.activate`, `campaign.pause`, `campaign.resume`, `campaign.cancel`, `campaign.finish`, `campaign.preview_segment`, `campaign.automations.generated`.

## 14. Idempotency

Activate guarded NR-005; no idempotency key needed for activate (the status guard is the backstop; concurrent retries fail safely). All other endpoints: per API_GUIDELINES §19 (no explicit keys in v1).