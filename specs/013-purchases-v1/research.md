# Research: Purchases v1

Phase 0 output for `specs/013-purchases-v1`. Resolves the technical unknowns from the plan's Technical Context. Format per decision: Decision / Rationale / Alternatives considered. Where a decision mirrors an approved Customers v1 decision, the precedent research entry is cited.

## R-001: Tenant enforcement point

- **Decision**: Enforce tenant scope in the service layer: every Purchase query receives the actor (`request.user`) and applies `where: { organizationId: user.organizationId }` for ORGANIZATION users; `PLATFORM_OWNER` (`accountType === 'PLATFORM'`, `organizationId === null`) bypasses the filter. `TenantScopeGuard` is NOT used.
- **Rationale**: Mirror of Customers v1 R-001. `TenantScopeGuard` hardcodes `params.id === user.organizationId` — unsuitable for resource ids. API_GUIDELINES §18 and HG-2 mandate orgId-in-every-query; the service layer is the single enforcement point.
- **Alternatives considered**: generalizing `TenantScopeGuard` (modifies shared core; excluded); trusting controller code (violates central enforcement).

## R-002: Cross-tenant response semantics

- **Decision**: Cross-tenant access to a purchase resource (get/update by id) returns `404` with `{ "error": { "code": "PURCHASE_NOT_FOUND", "message": "Purchase not found" } }`. Role denials return `403` `FORBIDDEN`.
- **Rationale**: HG-2 approved; mirror of Customers v1 R-002/HG-3 (non-enumerating 404). The service uses `findFirst({ where: { id, organizationId } })` so existence is never disclosed across orgs.
- **Alternatives considered**: 403 FORBIDDEN for cross-tenant (rejected; leaks existence); generic NOT_FOUND (loses domain clarity vs. the documented `CUSTOMER_NOT_FOUND` pattern).

## R-003: Role matrix (OPERADOR read-only)

- **Decision**: Writes (create/update) require roles `ADMINISTRADOR`, `GERENTE`, or `PLATFORM_OWNER` via `@Roles(...)` on the handlers; reads are allowed for all authenticated org roles and PLATFORM_OWNER. OPERADOR attempts any write → `403` `FORBIDDEN`.
- **Rationale**: HG-2 approved; mirror of Customers v1 R-003 (OPERADOR read-only). No role-specific purchase rules exist in the domain specs; the customers matrix is the approved cross-module pattern.
- **Alternatives considered**: all org roles writable (contradicts actor model); only ADMINISTRADOR writable (GERENTE manages the record per Módulo 03 funcionalidades 02-modules.md:88-110).

## R-004: invoiceNumber immutability

- **Decision**: `invoiceNumber` is rejected on update. `UpdatePurchaseDto` declares it with an immutable constraint (mirror of customers' `CodcliImmutableConstraint` pattern) so explicit attempts return 400. `invoiceNumber` is required on create (max length 50).
- **Rationale**: HG-7 approved. invoiceNumber is part of the duplicate identity key (CP-005, schema.prisma:154); changing it would break ERP traceability.
- **Alternatives considered**: allowing invoiceNumber changes with uniqueness re-check (breaks CP-005 identity semantics; rejected by HG-7).

## R-005: Audit integration

- **Decision**: Reuse `AuditIdentityService` with `module: 'purchases'`. Actions: `purchase.create.success|failure`, `purchase.update.success|failure`. No delete actions (no DELETE, HG-4). `PurchasesModule` imports `AuthModule`. NO change to the audit service this time — the `module?: string` parameter already exists (Customers v1 HG-9).
- **Rationale**: HG-6/8 approved; the service provides sanitization (SENSITIVE_METADATA_KEYS), never-throw semantics, and Audit-row persistence (audit.identity.service.ts:52-66).
- **Alternatives considered**: a second audit service inside purchases (duplicates logic); writing Audit rows directly with Prisma (bypasses sanitization and never-throw guarantees).

## R-006: Pagination contract

- **Decision**: `GET /purchases` accepts `page` (int ≥ 1, default 1) and `limit` (int 1..100, default 20); response is `{ "data": PurchaseSummary[], "meta": { "page", "limit", "total", "pages" } }` where `pages = ceil(total / limit)`.
- **Rationale**: API_GUIDELINES §10; NR-006 caps the limit; mirror of Customers v1 R-006.
- **Alternatives considered**: cursor-based pagination (not specified; offset is the documented contract).

## R-007: Filters, search, and sort

- **Decision** (inference, documented in spec.md Known Conflicts):
  - `search`: single parameter; case-insensitive `contains` on `invoiceNumber` only (02-modules.md:96 lists Factura as the record field; API_GUIDELINES §13 single search param).
  - Filters (all optional): `customerId` (exact), `productId` (exact), `status` (enum COMPLETED|CANCELLED|REFUNDED), `dateFrom`, `dateTo` (ISO dates, inclusive bounds on `purchaseDate`).
  - `sort`: whitelist `purchaseDate`, `invoiceNumber`, `quantity`, `value`, `status`, `createdAt`, `updatedAt`; leading `-` means descending; default `-purchaseDate`.
- **Rationale**: API_GUIDELINES §11-13; a whitelist prevents arbitrary Prisma `orderBy`/injection (NR-006). Customer-name search is deferred (explicit `customerId` filter covers the use case).
- **Alternatives considered**: free-form `orderBy` (injection risk); search over customer name via relation (deferred to keep list queries single-table; can be added additively later).

## R-008: Money handling (Decimal as string)

- **Decision**: `value` is `Decimal(12,2)` in the DB (schema.prisma:142) and is serialized as **string** in API responses (Prisma.Decimal `toJSON()` → string). DTO validation: optional/required string matching `^\d{1,10}(\.\d{1,2})?$` (max 10 integer digits, 2 decimals) plus `@MaxLength(13)`. DB writes use `new Prisma.Decimal(value)`.
- **Rationale**: HG-7 approved; JS `number` round-trips lose precision for money; string is the lossless transport format. Regex mirrors the `Decimal(12,2)` column width.
- **Alternatives considered**: number in JSON (precision loss); integer minor-units (spec does not define minor units; rejected).

## R-009: List/detail query shape (no N+1)

- **Decision** (inference — recommended, not gated): List uses two Prisma calls — `count({ where })` + `findMany({ where, orderBy, skip, take, include: { customer: { select: { id, codcli, name } }, product: { select: { id, code, name } } } })` with identical `where`. Detail uses `findFirst` with the same include. This returns customer/product summaries inline in ONE query per page (both FK columns indexed).
- **Rationale**: 06-database.md:388-402 (millions of purchases, no redesign); NR-008; the detail/record view is part of the module (01-mvp.md:90 "Consulta"). Prisma `findMany` + `include` on indexed FKs has no N+1.
- **Alternatives considered**: separate lookups per row (N+1, rejected); plain rows without summaries (less useful; summaries are zero-extra-cost with include).

## R-010: Duplicate detection strategy

- **Decision**: Detect duplicates with a pre-check `findFirst({ where: { organizationId, invoiceNumber, customerId, productId, purchaseDate } })` returning 409, **and** handle Prisma `P2002` as a race-condition backstop (catch → 409). The composite unique (schema.prisma:154) is the DB guarantee (CP-005).
- **Rationale**: Mirror of Customers v1 R-014; the pre-check gives a clean 409 for the common case; P2002 covers concurrent creates.
- **Alternatives considered**: pre-check only (race window); P2002 only (confusing for the common case).

## R-011: customerId/productId tenant validation on create

- **Decision** (inference from HG-3): on create, the service resolves the target `organizationId` (JWT or validated platform org), then validates `customer.findFirst({ where: { id, organizationId, deletedAt: null } })` and `product.findFirst({ where: { id, organizationId, deletedAt: null } })`. Unknown or cross-tenant customer/product → `400` `VALIDATION_ERROR` "Customer not found in this organization" / "Product not found in this organization".
- **Rationale**: HG-3 mandates validating productId (and by symmetry customerId) existence and tenant access. 400 matches the platform-organization validation precedent (Customers v1 R-012); 404 for referenced entities would conflate entity-not-found with the purchase resource code.
- **Alternatives considered**: 404 PURCHASE_NOT_FOUND for bad references (misleading code); skipping validation (orphan/foreign-tenant references, violates HG-3).

## R-012: PLATFORM_OWNER organizationId on create

- **Decision**: `CreatePurchaseDto` declares optional `organizationId`. If the actor is ORGANIZATION and `organizationId` is present → `400` `VALIDATION_ERROR`. If the actor is PLATFORM and `organizationId` is absent → `400` `VALIDATION_ERROR`. If PLATFORM and present → organization must exist (`prisma.organization.findUnique`) else `400` `VALIDATION_ERROR`.
- **Rationale**: HG-2 approved; exact mirror of Customers v1 R-012.
- **Alternatives considered**: separate platform-only DTO; ignoring organizationId for org users (silent, hides mistakes).

## R-013: Immutability of customerId/productId on update

- **Decision** (inference, documented in spec.md Known Conflicts): `UpdatePurchaseDto` does NOT accept `customerId` or `productId` (whitelist rejects them → 400). PATCH may change: `purchaseDate`, `quantity`, `value`, `status`, `phone`-like free fields (none — those four only).
- **Rationale**: CP-004 allows status changes; re-pointing a purchase to another customer/product would break CP-005 duplicate identity and historical traceability. Spec does not define re-pointing; conservative choice. Documented as inference pending future module decisions.
- **Alternatives considered**: allowing re-pointing with re-validation (breaks duplicate identity; speculative).

## R-014: Error codes

- **Decision**:
  - `404` `PURCHASE_NOT_FOUND` "Purchase not found" — get/update on missing or cross-tenant purchase (R-002).
  - `409` `CONFLICT` "A purchase with this invoiceNumber already exists" — duplicate tuple (CP-005).
  - `400` `BAD_REQUEST` — DTO validation failures (global ValidationPipe + filter mapping).
  - `400` `VALIDATION_ERROR` — service-level business validation (immutable invoiceNumber via constraint → BAD_REQUEST shape; org-user organizationId; platform missing/unknown organizationId; unknown/cross-tenant customerId/productId).
  - `403` `FORBIDDEN` "Forbidden" — role denials (RolesGuard).
  - `401` — missing/invalid token (JwtAuthGuard).
- **Rationale**: Mirrors Customers v1 R-013 conventions and the HTTP filter's DEFAULT_CODES.
- **Alternatives considered**: generic NOT_FOUND (loses domain clarity).

## R-015: Query parameters as DTO

- **Decision**: List query params are validated via `QueryPurchasesDto` (class-validator: `@Type(() => Number)` for page/limit, `@IsEnum` for status, `@IsDateString` for dates, `@IsIn` for sort, `@IsString` for ids) using the global ValidationPipe (transform: true).
- **Rationale**: The global pipe (`whitelist: true, transform: true`) already transforms and validates query DTOs; class-validator is the project standard (09-development-standards "nunca validar manualmente"; Customers v1 R-016).
- **Alternatives considered**: manual param parsing (violates the standard).

## R-016: No domain events in v1

- **Decision**: Purchases v1 emits no events. No event infrastructure exists in the repository. `PurchaseImported` (07-event-architecture.md:42) and AU-001 automation generation (03-business-rules.md:177-183) are deferred to the Import/Automations modules.
- **Rationale**: HG-6 approved; mirror of Customers v1 R-010.
- **Alternatives considered**: adding `@nestjs/event-emitter` (new dependency; no consumers yet; deferred).

## R-017: Validation rules summary

- **Decision**:
  - `invoiceNumber`: required on create, string ≤ 50, immutable on update (R-004).
  - `purchaseDate`: required on create, `@IsDateString()` ISO 8601.
  - `quantity`: required on create, `@IsInt()` ≥ 1.
  - `value`: required on create, money string (R-008).
  - `status`: optional on create (default COMPLETED), enum on update; no transitions workflow (HG-7).
  - `customerId`/`productId`: required on create, string; validated tenant-scoped (R-011); immutable on update (R-013).
  - `organizationId`: optional; required for PLATFORM_OWNER; forbidden for org users (R-012).
- **Rationale**: HG-7 + API_GUIDELINES §12; field set mirrors 06-database.md:142-157.
- **Alternatives considered**: none — field set is explicit in the domain model.
