# Feature Specification: Products v1

**Feature**: Products v1 — Product catalog management
**Short name**: `products-v1`
**Created**: 2026-08-13
**Status**: Draft
**Input**: User approved plan `specs/014-products-v1/plan.md`; domain sources `specs/04-domain-model.md` (Producto), `specs/06-database.md` (Product), `specs/02-modules.md` (Módulo 03 — campo Producto), `specs/03-business-rules.md` (CA-003), `specs/07-event-architecture.md` (Productos)

## User Scenarios & Testing *(mandatory)*

**Clarifications Session: 2026-08-13** (HUMAN GATES HG-1..HG-5, approved verbatim)

- Q1: Products v1 has no explicit module in 02-modules.md. What is the scope? → A1: HG-1 approved: full manual CRUD (list/get/create/update/soft-delete, 5 endpoints, pattern customers v1). Sources: entity definition 04-domain-model.md:63-75, table 06-database.md:127-139, existing OpenAPI tag "Products — Product catalog" (specs/api/info/tags.yaml), and the Products-out-of-scope decision of Purchases v1 (HG-3, 013-purchases-v1) which deferred CRUD to a dedicated module.

- Q2: Is DELETE part of Products v1? → A2: Yes (HG-2). The generic soft-delete rule applies to all entities (06-database.md:328-333; API_GUIDELINES §5 "DELETE: Soft Delete", §14). Unlike purchases (CP-004 "nunca debe eliminarse", 03-business-rules.md:113-119), no domain rule protects products. Soft delete sets `deletedAt`/`deletedBy`; hidden from queries; history preserved. Purchases keep their historical product summaries (purchases v1 include has no deletedAt filter — no purchases code change), and creating a purchase referencing a soft-deleted product returns 400 (existing purchases R-011 already filters `deletedAt: null`).

- Q3: Is the `code` field mutable after creation? → A3: No (HG-3). `code` is immutable (mirror of purchases `invoiceNumber`, R-004): PATCH attempts → 400. `code` is the ERP-facing reference (01-mvp.md:65-73 export/import flow) and part of the unique identity `(organizationId, code)` (schema.prisma:128).

- Q4: What exactly is added to the Product model? → A4: HG-4 approved: `createdBy`, `updatedBy`, `deletedBy` (nullable, actor id from JWT) plus `@@index([organizationId, status])` (06-database.md:336-353 mandates estado lookup indexes). Additive migration, `--create-only`, SQL review before apply.

- Q5: Are domain events emitted? → A5: No (HG-5). No event infrastructure exists. `ProductImported`/`ProductUpdated` (07-event-architecture.md:154-159) are future responsibilities of the Import module (Módulo 04, 02-modules.md:112-133). No new dependencies.

- Q6: How is product audit logging implemented? → A6: Reuse `AuditIdentityService` with `module: 'products'` (the additive `module?: string` parameter already exists from Customers v1 HG-9). Actions `product.create|update|delete` + `.success|.failure` (delete actions are new vs. purchases — DELETE exists in v1).

- Q7: What are the status semantics? → A7: `ProductStatus` ACTIVE | INACTIVE (schema.prisma:431-434). Default ACTIVE on creation. Changes via PATCH without restrictive transitions in v1 (no transition rules exist in the domain specs; pattern HG-7 purchases).

---

### User Story 1 - P1: List products with pagination, filters, and search
**Description**: Users list products of their organization with pagination, optional filters (status, category, createdAt range), single search parameter, and sorting.

**Why this priority**: P1 — the product reference is the segmentation/identification backbone of the domain ("Identificar la referencia vendida", "Permitir segmentaciones", 04-domain-model.md:71-75).

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/products?page=1&limit=20 → 200 with only own-organization products, meta `{page, limit, total, pages}`; `?search=`, `?status=`, `?category=`, `?createdFrom=`, `?createdTo=`, `?sort=-createdAt` applied.

**Acceptance Scenarios**:
1. **Given** an organization user with products in their org, **When** they GET /products, **Then** only their org's products are returned, paginated with correct meta.
2. **Given** the search parameter `?search=BATERIA`, **When** listing, **Then** products whose code, name, or category contains the term (case-insensitive) are returned.
3. **Given** `?status=ACTIVE&category=Accesorios`, **When** listing, **Then** only matching products are returned (filters always optional, API_GUIDELINES §12).
4. **Given** `?sort=-createdAt`, **When** listing, **Then** results are ordered newest first.
5. **Given** soft-deleted products exist, **When** listing, **Then** they are excluded (API_GUIDELINES §14 "Los registros eliminados no aparecerán en consultas normales").

### User Story 2 - P1: Get product by id
**Description**: Users view a product's full record within their organization.

**Why this priority**: P1 — product consultation is a core read path of the catalog.

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/products/:id → 200 with product data; product of another org → 404 PRODUCT_NOT_FOUND; soft-deleted product → 404.

**Acceptance Scenarios**:
1. **Given** a product in the user's org, **When** GET /products/:id, **Then** 200 with the product record.
2. **Given** a product id of another organization, **When** GET /products/:id, **Then** 404 `PRODUCT_NOT_FOUND` (non-enumerating).
3. **Given** an unknown or soft-deleted product id, **When** GET /products/:id, **Then** 404 `PRODUCT_NOT_FOUND`.

### User Story 3 - P1: Create product
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER create products within the tenant scope derived from the JWT.

**Why this priority**: P1 — the catalog needs manual registration (HG-1); bulk creation via ERP import (ProductImported) belongs to the future Import module (HG-5).

**Independent Test**: Login as ADMINISTRADOR → POST /products {code, name} → 201 with product; same code → 409 CONFLICT; OPERADOR → 403; PLATFORM_OWNER with valid organizationId → 201; org user with organizationId → 400.

**Acceptance Scenarios**:
1. **Given** valid body, **When** POST /products, **Then** 201 with the created product (default status ACTIVE, `createdBy` set).
2. **Given** an existing `(organizationId, code)` tuple, **When** POST /products again, **Then** 409 CONFLICT (schema.prisma:128).
3. **Given** an OPERADOR user, **When** POST /products, **Then** 403 FORBIDDEN (HG-1).
4. **Given** a PLATFORM_OWNER, **When** POST /products with valid `organizationId`, **Then** 201; product belongs to that organization.
5. **Given** a PLATFORM_OWNER, **When** POST /products with missing or unknown `organizationId`, **Then** 400 VALIDATION_ERROR (HG-1).
6. **Given** an organization user, **When** POST /products with `organizationId` in body, **Then** 400 VALIDATION_ERROR (tenant never from client).

### User Story 4 - P1: Update product
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER update product fields; `code` is immutable.

**Why this priority**: P1 — keeping catalog data correct (name/category corrections, ACTIVE↔INACTIVE) is core catalog hygiene.

**Acceptance Scenarios**:
1. **Given** an existing product in the user's org, **When** PATCH /products/:id with valid fields, **Then** 200 with the updated product; `updatedAt` changes; `updatedBy` set.
2. **Given** a body attempting to change `code`, **When** PATCH /products/:id, **Then** 400 (immutable, HG-3).
3. **Given** a product id of another org, unknown, or soft-deleted, **When** PATCH, **Then** 404 PRODUCT_NOT_FOUND.
4. **Given** an OPERADOR, **When** PATCH, **Then** 403 FORBIDDEN.
5. **Given** `{"status": "INACTIVE"}`, **When** PATCH, **Then** 200; status updated (no transitions workflow in v1, Q7).

### User Story 5 - P1: Delete product (soft)
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER soft-delete products; records are never physically removed (HG-2).

**Why this priority**: P1 — decommissioning obsolete catalog entries (e.g., discontinued battery references) while preserving history (API_GUIDELINES §14).

**Acceptance Scenarios**:
1. **Given** an existing product in the user's org, **When** DELETE /products/:id, **Then** 200 with `{data:{success:true}}`; `deletedAt`/`deletedBy` set; product hidden from list/get.
2. **Given** a soft-deleted product, **When** DELETE /products/:id again, **Then** 404 PRODUCT_NOT_FOUND.
3. **Given** a product id of another org, **When** DELETE, **Then** 404 PRODUCT_NOT_FOUND (non-enumerating).
4. **Given** an OPERADOR, **When** DELETE, **Then** 403 FORBIDDEN.
5. **Given** a soft-deleted product referenced by purchases, **When** those purchases are listed, **Then** the product summary is still returned (historical record, CP-004 purchases; HG-2).
6. **Given** a soft-deleted product, **When** POST /purchases references it, **Then** 400 VALIDATION_ERROR (existing purchases R-011, `deletedAt: null` filter).

### User Story 6 - P1: Tenant isolation and authorization
**Description**: All product queries are scoped to the JWT `organizationId`; PLATFORM_OWNER operates across organizations; role restrictions enforced.

**Why this priority**: P1 — data isolation is the core security requirement (API_GUIDELINES §18; AGENTS.md Multi-Tenancy).

**Acceptance Scenarios**:
1. **Given** an organization user, **When** any product query executes, **Then** the `organizationId` filter comes exclusively from `request.user.organizationId`; never from body/query.
2. **Given** an organization user and a product of another org, **When** accessing it, **Then** 404 PRODUCT_NOT_FOUND.
3. **Given** a PLATFORM_OWNER, **When** listing products, **Then** 200 with products from any organization (bypass).
4. **Given** an OPERADOR, **When** creating/updating/deleting, **Then** 403 FORBIDDEN.
5. **Given** an unauthenticated request, **When** hitting a product endpoint, **Then** 401.

### User Story 7 - P2: Audit logging
**Description**: Every product write operation (create/update/delete) is recorded in the Audit table; failures never break the operation.

**Why this priority**: P2 — AD-001/002 (03-business-rules.md:330-346) require user/date/action/module records.

**Acceptance Scenarios**:
1. **Given** a successful product create/update/delete, **When** the operation completes, **Then** an Audit row exists with `module='products'`, action `product.create|update|delete.success`, `userId`, `organizationId` (from JWT), timestamp.
2. **Given** a rejected operation (duplicate, forbidden role, not found), **When** it fails, **Then** an Audit row records `product.*.failure` with non-sensitive metadata.
3. **Given** an Audit persistence failure, **When** the operation runs, **Then** the business operation still succeeds (audit never alters behavior).

## Requirements

### Functional Requirements

- **FR-001**: System MUST list products scoped to the authenticated user's organization, paginated (`page`, `limit`), with meta `{page, limit, total, pages}` (API_GUIDELINES §10).
- **FR-002**: System MUST support a single search parameter `search` matching code, name, or category (case-insensitive contains) (API_GUIDELINES §13).
- **FR-003**: System MUST support optional filters `status`, `category`, `createdFrom`, `createdTo` (createdAt range); filters are always optional (API_GUIDELINES §12).
- **FR-004**: System MUST support sorting via `sort` (`code`, `-name`, etc.; "-" = descending) against a whitelist (API_GUIDELINES §11).
- **FR-005**: System MUST return a product by id within the user's organization; cross-tenant, unknown, and soft-deleted products return 404 `PRODUCT_NOT_FOUND`.
- **FR-006**: System MUST create products with unique `(organizationId, code)`; duplicates return 409 CONFLICT (schema.prisma:128).
- **FR-007**: System MUST allow updating mutable product fields (`name`, `category`, `status`); `code` is immutable after creation (HG-3).
- **FR-008**: Product write operations (create/update/delete) MUST be restricted to ADMINISTRADOR, GERENTE, and PLATFORM_OWNER; OPERADOR is read-only (HG-1).
- **FR-009**: PLATFORM_OWNER MUST specify `organizationId` when creating products; the organization MUST exist (HG-1).
- **FR-010**: Organization users MUST NOT provide `organizationId`; the tenant scope comes exclusively from the JWT (API_GUIDELINES §18).
- **FR-011**: Every product write operation MUST be audited (`module='products'`, action `product.create|update|delete`, outcome, actor, organization) (AD-001/002).
- **FR-012**: DELETE MUST soft-delete (`deletedAt`/`deletedBy`), hide the record from queries, and preserve history (06-database.md:328-333; API_GUIDELINES §5/§14; HG-2). Purchases keep their historical product summaries; purchases creation rejects soft-deleted products (existing purchases R-011).

### Non-Functional / Security Requirements

- **NR-001**: Tenant scope is always derived from the authenticated JWT (`request.user.organizationId`); never from client input (API_GUIDELINES §18).
- **NR-002**: Cross-tenant resource access returns 404 `PRODUCT_NOT_FOUND` (non-enumerating).
- **NR-003**: All product endpoints require a valid JWT (`JwtAuthGuard`); unauthenticated requests return 401.
- **NR-004**: Audit metadata never contains passwords, tokens, or other sensitive data.
- **NR-005**: Audit failures never break or alter business operations (audit is best-effort).
- **NR-006**: Pagination limits are capped (max limit 100) to protect list endpoints.
- **NR-007**: List queries must not N+1; single `count` + `findMany` on the products table per page (06-database.md:388-402).
- **NR-008**: `createdFrom`/`createdTo` accept date-only input with whole-day-inclusive semantics; full ISO datetimes preserve their exact instant (pattern fixed in purchases, commit `dca47bc`).

## Product Lifecycle

```
 [POST create]   [PATCH status — no transitions workflow in v1]   [DELETE — soft]
       │                  │                                            │
       v                  v                                            v
     ACTIVE ──────────► INACTIVE                          deletedAt/deletedBy set
       │                                                    (hidden from queries)
       └────────── (never physically deleted — 06-database.md:328-333)
```

- **ACTIVE**: default on creation (schema.prisma:120).
- **INACTIVE**: set via PATCH `status`; no restrictive transitions in v1 (Q7).
- **Soft-deleted**: DELETE sets `deletedAt`/`deletedBy`; record hidden from list/get; re-DELETE → 404; unique `(organizationId, code)` is NOT released (no partial index — documented inference, see Known Conflicts).

## Acceptance Scenarios

| Scenario | Precondition | Action | Expected Outcome |
|----------|-------------|--------|------------------|
| AS-001 | Org user with products | GET /products?page=1&limit=20 | 200; only own-org products; meta `{page,limit,total,pages}` |
| AS-002 | Product code "P-100" name "Batería X" | GET /products?search=bateria | 200; matching products only (case-insensitive) |
| AS-003 | Multiple products | GET /products?sort=-createdAt | 200; newest first |
| AS-004 | Product in another org | GET /products/:id | 404 PRODUCT_NOT_FOUND (no data leak) |
| AS-005 | Valid body | POST /products | 201; product created ACTIVE; `createdBy` set; audit `product.create.success` |
| AS-006 | Existing (org, code) tuple | POST /products | 409 CONFLICT; audit `product.create.failure` |
| AS-007 | OPERADOR writes | POST/PATCH/DELETE | 403 FORBIDDEN |
| AS-008 | PLATFORM_OWNER with valid organizationId | POST /products | 201 in target org; list shows all orgs |
| AS-009 | PLATFORM_OWNER with missing/unknown organizationId | POST /products | 400 VALIDATION_ERROR |
| AS-010 | Org user sends organizationId | POST /products | 400 VALIDATION_ERROR (tenant from JWT only) |
| AS-011 | Update mutable fields | PATCH /products/:id | 200; updatedAt/updatedBy set; audit `product.update.success` |
| AS-012 | Change code | PATCH /products/:id | 400 (immutable, HG-3) |
| AS-013 | Change status | PATCH /products/:id `{"status":"INACTIVE"}` | 200; status updated (no transitions workflow) |
| AS-014 | Delete product | DELETE /products/:id | 200 `{data:{success:true}}`; hidden from list/get; audit `product.delete.success` |
| AS-015 | Delete again / cross-tenant delete | DELETE /products/:id | 404 PRODUCT_NOT_FOUND |
| AS-016 | No token | Any product endpoint | 401 |
| AS-017 | Audit DB failure | Any product write | Operation still succeeds; no error surfaced |
| AS-018 | Purchases reference soft-deleted product | POST /purchases | 400 VALIDATION_ERROR (purchases R-011); purchases list still shows the summary (HG-2) |

## Success Criteria *(mandatory)*

- **SC-001**: List endpoint returns only the actor's organization products with correct pagination meta; filters, search, and sort behave per API_GUIDELINES; soft-deleted products are excluded.
- **SC-002**: Duplicate detection holds (409 on duplicate `(organizationId, code)`); `code` immutable after creation.
- **SC-003**: Cross-tenant access returns 404 PRODUCT_NOT_FOUND; no data leaks across organizations.
- **SC-004**: Role matrix enforced: OPERADOR read-only (403 on writes); ADMINISTRADOR/GERENTE org-scoped writes; PLATFORM_OWNER cross-org writes with validated organizationId.
- **SC-005**: DELETE soft-deletes (deletedAt/deletedBy set, hidden from queries, history preserved); purchases keep their historical summaries; no physical deletion anywhere.
- **SC-006**: All write operations produce Audit rows (module=products) with actor and organization from JWT; audit failures never break operations.
- **SC-007**: `createdFrom`/`createdTo` day-boundary semantics verified (date-only inclusive; full datetime exact); products module reaches ≥ 80% coverage; all scenarios AS-001..AS-018 pass.

## Explicit Out-of-Scope Items

- ❌ Product import (Excel/CSV/ERP) — future Import module (Módulo 04, 02-modules.md:112-133; `ProductImported` 07-event-architecture.md:156)
- ❌ Domain events (`ProductImported`, `ProductUpdated`) — no event infrastructure (HG-5)
- ❌ Inventory management — explicitly out of MVP (01-mvp.md:128)
- ❌ Category catalog management — text-free field in v1; a formal catalog belongs to Módulo 10 Configuración (02-modules.md:258-275)
- ❌ Campaign segmentation by product (CA-003, 03-business-rules.md:285-293) — future Campaigns module
- ❌ Status transitions workflow — none in v1 (Q7)
- ❌ Releasing the `(organizationId, code)` unique slot after soft delete — no partial index (inference, see Known Conflicts)
- ❌ Any modification to purchases/customers modules — only `app.module.ts` registration (HG-2)

## Known Conflicts / Decisions Pending

| Conflict | Source | Resolution |
|----------|--------|------------|
| No "Productos" module in 02-modules.md vs. entity/table/OpenAPI presence | 02-modules.md:30-275 vs. 04-domain-model.md:63-75, 06-database.md:127-139, specs/api/info/tags.yaml | **HUMAN GATE approved (HG-1)**: full manual CRUD in v1. Products appear as purchase field (02-modules.md:98), domain entity with responsibilities, and OpenAPI tag; Purchases v1 HG-3 deferred CRUD to a dedicated module. |
| Generic soft delete for ALL entities vs. purchases precedent (no DELETE, CP-004) | 06-database.md:328-333 + API_GUIDELINES §5/§14 vs. 03-business-rules.md:113-119 | **HUMAN GATE approved (HG-2)**: CP-004 protects purchases only; products use the generic soft delete with DELETE endpoint. Purchases keep historical summaries; creating a purchase with a soft-deleted product → 400 (existing R-011). |
| `code` mutability undefined | 06-database.md:131 "codigo" without a mutability rule | **HUMAN GATE approved (HG-3)**: immutable after creation (mirror of purchases invoiceNumber R-004; ERP traceability 01-mvp.md:65-73). |
| Soft delete does not release the `(organizationId, code)` unique slot | schema.prisma:128 (no partial index) vs. perceived reusability | Documented inference: a new product with the same code as a soft-deleted one → 409 CONFLICT. Consistent with customers `codcli` behavior (012-customers-v1); changing it requires a partial unique index + HG approval. |
| API_GUIDELINES §17 lists roles "Owner/Administrator/Operator/Viewer" vs. approved Identity v1 roles | API_GUIDELINES §17 vs. specs/011-identity-v1 decisions | Products v1 uses the Identity v1 role set (ADMINISTRADOR/GERENTE/OPERADOR/PLATFORM_OWNER), already resolved in Identity v1. |
| `search` scope (which fields) | API_GUIDELINES §13 defines a single `search` param; no field list in specs | Decision R-007 (inference): search over code, name, and category (case-insensitive contains). |
| `category` values (enum vs free text) | 06-database.md:136 "categoria" without a catalog definition | Decision R-015 (inference): free text ≤ 100 chars, optional. A formal catalog is future Módulo 10 Configuración. |
| `status` transitions | No transition rules in domain specs | Decision Q7 (inference, pattern HG-7 purchases): status freely changeable via PATCH. |

---