# Research: Products v1

Phase 0 output for `specs/014-products-v1`. Resolves the technical unknowns from the plan's Technical Context. Format per decision: Decision / Rationale / Alternatives considered. Where a decision mirrors an approved Customers/Purchases v1 decision, the precedent research entry is cited.

## R-001: Tenant enforcement point

- **Decision**: Enforce tenant scope in the service layer: every Product query receives the actor (`request.user`) and applies `where: { organizationId: user.organizationId }` for ORGANIZATION users; `PLATFORM_OWNER` (`accountType === 'PLATFORM'`, `organizationId === null`) bypasses the filter. `TenantScopeGuard` is NOT used.
- **Rationale**: Mirror of Purchases v1 R-001. `TenantScopeGuard` hardcodes `params.id === user.organizationId` — unsuitable for resource ids. API_GUIDELINES §18 and HG-1 mandate orgId-in-every-query; the service layer is the single enforcement point.
- **Alternatives considered**: generalizing `TenantScopeGuard` (modifies shared core; excluded); trusting controller code (violates central enforcement).

## R-002: Cross-tenant response semantics

- **Decision**: Cross-tenant access to a product resource (get/update/delete by id) returns `404` with `{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Product not found" } }`. Role denials return `403` `FORBIDDEN`.
- **Rationale**: HG-1 approved; mirror of Purchases v1 R-002 / Customers v1 R-002 (non-enumerating 404). The service uses `findFirst({ where: { id, organizationId, deletedAt: null } })` so existence is never disclosed across orgs, and soft-deleted products behave as missing.
- **Alternatives considered**: 403 FORBIDDEN for cross-tenant (rejected; leaks existence); generic NOT_FOUND (loses domain clarity vs. the documented `CUSTOMER_NOT_FOUND`/`PURCHASE_NOT_FOUND` pattern).

## R-003: Role matrix (OPERADOR read-only)

- **Decision**: Writes (create/update/delete) require roles `ADMINISTRADOR`, `GERENTE`, or `PLATFORM_OWNER` via `@Roles(...)` on the handlers; reads are allowed for all authenticated org roles and PLATFORM_OWNER. OPERADOR attempts any write → `403` `FORBIDDEN`.
- **Rationale**: HG-1 approved; mirror of Purchases v1 R-003 / Customers v1 R-003 (OPERADOR read-only). No role-specific product rules exist in the domain specs; the customers/purchases matrix is the approved cross-module pattern.
- **Alternatives considered**: all org roles writable (contradicts actor model); only ADMINISTRADOR writable (GERENTE manages records per the module pattern).

## R-004: code immutability

- **Decision**: `code` is rejected on update. `UpdateProductDto` declares it with an immutable constraint (mirror of customers' `CodcliImmutableConstraint` / purchases' `InvoiceNumberImmutableConstraint` pattern) so explicit attempts return 400. `code` is required on create (max length 50).
- **Rationale**: HG-3 approved. `code` is part of the unique identity key (schema.prisma:128) and the ERP-facing reference (01-mvp.md:65-73); changing it would break ERP traceability (same rationale as purchases invoiceNumber R-004).
- **Alternatives considered**: allowing code changes with uniqueness re-check (breaks identity semantics; rejected by HG-3).

## R-005: Audit integration

- **Decision**: Reuse `AuditIdentityService` with `module: 'products'`. Actions: `product.create.success|failure`, `product.update.success|failure`, `product.delete.success|failure` (delete actions are new vs. purchases — DELETE exists in v1 per HG-2). `ProductsModule` imports `AuthModule`. NO change to the audit service — the `module?: string` parameter already exists (Customers v1 HG-9).
- **Rationale**: HG-5 approved; the service provides sanitization (SENSITIVE_METADATA_KEYS), never-throw semantics, and Audit-row persistence (audit.identity.service.ts:52-66).
- **Alternatives considered**: a second audit service inside products (duplicates logic); writing Audit rows directly with Prisma (bypasses sanitization and never-throw guarantees).

## R-006: Pagination contract

- **Decision**: `GET /products` accepts `page` (int ≥ 1, default 1) and `limit` (int 1..100, default 20); response is `{ "data": ProductSummary[], "meta": { "page", "limit", "total", "pages" } }` where `pages = ceil(total / limit)`.
- **Rationale**: API_GUIDELINES §10; NR-006 caps the limit; mirror of Purchases v1 R-006 / Customers v1 R-006.
- **Alternatives considered**: cursor-based pagination (not specified; offset is the documented contract).

## R-007: Filters, search, and sort

- **Decision** (inference, documented in spec.md Known Conflicts):
  - `search`: single parameter; case-insensitive `contains` on `code`, `name`, or `category` (OR). Product identification and segmentation are the entity's responsibilities (04-domain-model.md:71-75); a single search param covers all three reference fields (API_GUIDELINES §13).
  - Filters (all optional): `status` (enum ACTIVE|INACTIVE), `category` (exact string), `createdFrom`, `createdTo` (ISO dates, inclusive bounds on `createdAt`, date-only = whole-day inclusive per NR-008).
  - `sort`: whitelist `code`, `name`, `category`, `status`, `createdAt`, `updatedAt`; leading `-` means descending; default `-createdAt` (mirror of customers).
- **Rationale**: API_GUIDELINES §11-13; a whitelist prevents arbitrary Prisma `orderBy`/injection (NR-006).
- **Alternatives considered**: free-form `orderBy` (injection risk); category as `contains` filter (exact match is the categorical semantics; customers' `city` contains precedent applies to free-text fields only).

## R-008: Soft delete semantics

- **Decision** (inference from HG-2 / API_GUIDELINES §14): DELETE sets `deletedAt` + `deletedBy`; no physical deletion. All queries filter `deletedAt: null`. The `(organizationId, code)` unique constraint is NOT released by soft delete (no partial index; re-creating the same code → 409, consistent with customers `codcli`). Purchases v1 behavior is preserved unchanged: its include of the product summary has no `deletedAt` filter (historical record), and its create-time validation filters `deletedAt: null` (013-purchases-v1 research.md R-011) so a purchase referencing a soft-deleted product → 400.
- **Rationale**: 06-database.md:328-333 "Los registros nunca serán eliminados físicamente"; API_GUIDELINES §14 "Los registros eliminados no aparecerán en consultas normales"; HG-2 approved the purchases-integration invariants.
- **Alternatives considered**: physical delete (violates the soft-delete rule); releasing the unique slot via partial unique index (schema change beyond v1; needs approval).

## R-009: List/detail query shape (no N+1)

- **Decision** (inference — recommended, not gated): List uses two Prisma calls — `count({ where })` + `findMany({ where, orderBy, skip, take })` with identical `where`. Detail uses `findFirst` with the same `where`. Products have no relation includes in v1 (no summary joins needed — the catalog is self-contained), so each page is exactly ONE query plus ONE count.
- **Rationale**: 06-database.md:388-402; NR-007; the table is small relative to customers/purchases but the pattern holds for consistency and future growth.
- **Alternatives considered**: separate lookups per row (N+1, rejected); adding aggregate fields (e.g., purchase counts — not defined by specs, rejected).

## R-010: Duplicate detection strategy

- **Decision**: Detect duplicates with a pre-check `findFirst({ where: { organizationId, code } })` returning 409, **and** handle Prisma `P2002` as a race-condition backstop (catch → 409). The unique `(organizationId, code)` (schema.prisma:128) is the DB guarantee. The pre-check does NOT filter `deletedAt: null` — the unique spans soft-deleted rows (R-008).
- **Rationale**: Mirror of Purchases v1 R-010; the pre-check gives a clean 409 for the common case; P2002 covers concurrent creates.
- **Alternatives considered**: pre-check only (race window); P2002 only (confusing for the common case).

## R-011: PLATFORM_OWNER organizationId on create

- **Decision**: `CreateProductDto` declares optional `organizationId`. If the actor is ORGANIZATION and `organizationId` is present → `400` `VALIDATION_ERROR`. If the actor is PLATFORM and `organizationId` is absent → `400` `VALIDATION_ERROR`. If PLATFORM and present → organization must exist (`prisma.organization.findUnique`) else `400` `VALIDATION_ERROR`.
- **Rationale**: HG-1 approved; exact mirror of Purchases v1 R-012 / Customers v1 R-012.
- **Alternatives considered**: separate platform-only DTO; ignoring organizationId for org users (silent, hides mistakes).

## R-012: Error codes

- **Decision**:
  - `404` `PRODUCT_NOT_FOUND` "Product not found" — get/update/delete on missing, cross-tenant, or soft-deleted product (R-002, R-008).
  - `409` `CONFLICT` "A product with this code already exists" — duplicate `(organizationId, code)` (R-010).
  - `400` `BAD_REQUEST` — DTO validation failures (global ValidationPipe + filter mapping).
  - `400` `VALIDATION_ERROR` — service-level business validation (immutable code via constraint → BAD_REQUEST shape; org-user organizationId; platform missing/unknown organizationId).
  - `403` `FORBIDDEN` "Forbidden" — role denials (RolesGuard).
  - `401` — missing/invalid token (JwtAuthGuard).
- **Rationale**: Mirrors Purchases v1 R-014 / Customers v1 R-013 conventions and the HTTP filter's DEFAULT_CODES.
- **Alternatives considered**: generic NOT_FOUND (loses domain clarity).

## R-013: Query parameters as DTO

- **Decision**: List query params are validated via `QueryProductsDto` (class-validator: `@Type(() => Number)` for page/limit, `@IsEnum` for status, `@IsDateString` for dates, `@IsIn` for sort, `@IsString` for search/category) using the global ValidationPipe (transform: true).
- **Rationale**: The global pipe (`whitelist: true, transform: true`) already transforms and validates query DTOs; class-validator is the project standard (09-development-standards "nunca validar manualmente"; Purchases v1 R-015).
- **Alternatives considered**: manual param parsing (violates the standard).

## R-014: No domain events in v1

- **Decision**: Products v1 emits no events. No event infrastructure exists in the repository. `ProductImported` and `ProductUpdated` (07-event-architecture.md:154-159) are deferred to the future Import module (Módulo 04, 02-modules.md:112-133).
- **Rationale**: HG-5 approved; mirror of Purchases v1 R-016 / Customers v1 R-010.
- **Alternatives considered**: adding `@nestjs/event-emitter` (new dependency; no consumers yet; deferred).

## R-015: Validation rules summary

- **Decision**:
  - `code`: required on create, string ≤ 50, immutable on update (R-004).
  - `name`: required on create, string ≤ 200, optional on update.
  - `category`: optional on create/update, string ≤ 100, free text (inference — no catalog in v1).
  - `status`: optional on create (default ACTIVE), enum on create/update; no transitions workflow (Q7).
  - `organizationId`: optional; required for PLATFORM_OWNER; forbidden for org users (R-011).
- **Rationale**: HG-3 + API_GUIDELINES §12; field set mirrors 06-database.md:131-138 and the approved gates.
- **Alternatives considered**: category as enum (no catalog defined in specs); name ≤ 100 (200 matches customers precedent).

---