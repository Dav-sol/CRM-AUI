# Feature Specification: Customers v1

**Feature**: Customers v1 — Customer directory management
**Short name**: `customers-v1`
**Created**: 2026-08-13
**Status**: Draft
**Input**: User description: "Implement the CUSTOMERS domain next" (approved plan `specs/012-customers-v1/plan.md`)

## User Scenarios & Testing *(mandatory)*

**Clarifications Session: 2026-08-13** (HUMAN GATES HG-1..HG-10, approved verbatim)

- Q1: Which roles may create/update/delete customers? → A1: OPERADOR is read-only (may list and view customers within their organization); ADMINISTRADOR and GERENTE may create, update, and soft-delete within their organization; PLATFORM_OWNER may operate across all organizations.

- Q2: Can codcli be modified after creation? → A2: No. codcli is the ERP identity key (CL-001/002); it is immutable after creation. Update attempts that change codcli are rejected.

- Q3: What does an organization user receive when accessing another organization's customer? → A3: 404 `CUSTOMER_NOT_FOUND` — uniform, non-enumerating response. Cross-tenant access never returns customer data and never distinguishes "exists but forbidden" from "not found".

- Q4: Is DELETE part of Customers v1, and what are its semantics? → A4: Yes. DELETE performs a soft delete (`deletedAt` set, record hidden from normal queries) per API_GUIDELINES.md §14. Historical data (purchases, conversations, audit) is never removed. Status transitions (e.g., INACTIVE for ERP deletions) are handled via PATCH status, not via DELETE.

- Q5: Are audit fields createdBy/updatedBy/deletedBy added to the Customer table? → A5: Yes. Additive migration adds `createdBy`, `updatedBy`, `deletedBy` (nullable, from authenticated JWT identity) per API_GUIDELINES.md §15, plus lookup indexes for status and createdAt.

- Q6: Are domain events (CustomerCreated/CustomerUpdated/…) emitted in Customers v1? → A6: No. No event infrastructure exists in the repository; events will be introduced with the Import module. Customers v1 performs no event emission.

- Q7: What is the behavior of the BLOCKED CustomerStatus value? → A7: Reserved. No additional behavior in v1; only ACTIVE and INACTIVE are used by Customers v1 operations.

- Q8: How is the phone field validated? → A8: Optional string with a reasonable length limit; no strict E.164 validation. CL-006 (valid phone required for automatic campaigns) is enforced by the future campaigns/automations modules, not by Customer CRUD.

- Q9: How is customer audit logging implemented? → A9: Reuse `AuditIdentityService` from the Auth module, extended additively with an optional `module?: string` parameter (default `'identity'`). Customer operations record with `module: 'customers'`.

- Q10: How does PLATFORM_OWNER create customers? → A10: PLATFORM_OWNER must specify `organizationId` in the request body; the target organization must exist (404-style validation error otherwise). Organization users never send `organizationId`; their tenant comes exclusively from the JWT.

---

### User Story 1 - P1: List customers with pagination, filters, and search
**Description**: Users list customers of their organization with pagination, optional filters (status, city, created range), single search parameter, and sorting.

**Why this priority**: P1 — the directory is the entry point of the module (MVP: búsqueda, historial).

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/customers?page=1&limit=20 → 200 with only own-organization customers, meta `{page, limit, total, pages}`; `?search=`, `?status=`, `?city=`, `?createdFrom=`, `?createdTo=`, `?sort=-createdAt` applied; records with `deletedAt` set are excluded.

**Acceptance Scenarios**:
1. **Given** an organization user with customers in their org, **When** they GET /customers, **Then** only their org's customers are returned, paginated with correct meta.
2. **Given** the search parameter `?search=juan`, **When** listing, **Then** customers whose name, codcli, phone, or email contain the term (case-insensitive) are returned.
3. **Given** `?sort=-createdAt`, **When** listing, **Then** results are ordered newest first.
4. **Given** a soft-deleted customer, **When** listing, **Then** it is not returned.

### User Story 2 - P1: Get customer by id
**Description**: Users view a customer's full profile within their organization.

**Why this priority**: P1 — customer detail (ficha) is a core read path.

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/customers/:id → 200 with customer data; customer of another org → 404 CUSTOMER_NOT_FOUND; soft-deleted customer → 404 CUSTOMER_NOT_FOUND.

**Acceptance Scenarios**:
1. **Given** a customer in the user's org, **When** GET /customers/:id, **Then** 200 with the customer record.
2. **Given** a customer id of another organization, **When** GET /customers/:id, **Then** 404 `CUSTOMER_NOT_FOUND` (non-enumerating, HG-3).
3. **Given** a soft-deleted customer, **When** GET /customers/:id, **Then** 404 `CUSTOMER_NOT_FOUND`.

### User Story 3 - P1: Create customer
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER create customers within the tenant scope derived from the JWT.

**Why this priority**: P1 — the directory must be writable (MVP: importación/actualización require the same uniqueness rules).

**Independent Test**: Login as ADMINISTRADOR → POST /customers {codcli, name} → 201 with customer; same codcli again → 409 CONFLICT; PLATFORM_OWNER with valid organizationId → 201 in that org; PLATFORM_OWNER with unknown organizationId → 400; OPERADOR → 403.

**Acceptance Scenarios**:
1. **Given** valid body, **When** POST /customers, **Then** 201 with the created customer (default status ACTIVE).
2. **Given** an existing `(organizationId, codcli)` pair, **When** POST /customers again, **Then** 409 CONFLICT (CL-002, 06-database:123).
3. **Given** an OPERADOR user, **When** POST /customers, **Then** 403 FORBIDDEN (HG-1).
4. **Given** a PLATFORM_OWNER, **When** POST /customers with valid `organizationId`, **Then** 201; customer belongs to that organization.
5. **Given** a PLATFORM_OWNER, **When** POST /customers with unknown `organizationId`, **Then** 400 VALIDATION_ERROR (HG-10).
6. **Given** an organization user, **When** POST /customers with `organizationId` in body, **Then** 400 VALIDATION_ERROR (tenant never from client, NR-009).

### User Story 4 - P1: Update customer
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER update customer contact fields; codcli is immutable.

**Why this priority**: P1 — contact data changes are the most frequent write operation (CL: phone change during import keeps history; here applied via PATCH).

**Acceptance Scenarios**:
1. **Given** an existing customer in the user's org, **When** PATCH /customers/:id with valid fields, **Then** 200 with the updated customer; `updatedAt` changes; `updatedBy` set.
2. **Given** a body attempting to change `codcli`, **When** PATCH /customers/:id, **Then** 400 VALIDATION_ERROR (HG-2).
3. **Given** a customer id of another org or soft-deleted, **When** PATCH, **Then** 404 CUSTOMER_NOT_FOUND.
4. **Given** an OPERADOR, **When** PATCH, **Then** 403 FORBIDDEN.

### User Story 5 - P2: Soft delete customer
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER soft-delete customers; the record and its history remain.

**Why this priority**: P2 — 06-database.md mandates soft delete and "registros nunca eliminados físicamente".

**Acceptance Scenarios**:
1. **Given** an existing customer, **When** DELETE /customers/:id, **Then** 200 `{data:{success:true}}`; `deletedAt` set; `deletedBy` set.
2. **Given** a soft-deleted customer, **When** GET /customers/:id or listing, **Then** 404 / excluded (hidden from normal queries).
3. **Given** a second DELETE on an already soft-deleted customer, **When** DELETE /customers/:id, **Then** 404 CUSTOMER_NOT_FOUND.
4. **Given** an OPERADOR, **When** DELETE, **Then** 403 FORBIDDEN.

### User Story 6 - P1: Tenant isolation and authorization
**Description**: All customer queries are scoped to the JWT `organizationId`; PLATFORM_OWNER operates across organizations; role restrictions enforced.

**Why this priority**: P1 — data isolation is the core security requirement (FR-013/NR-009/010; quickstart S8/S9).

**Acceptance Scenarios**:
1. **Given** an organization user, **When** any customer query executes, **Then** the `organizationId` filter comes exclusively from `request.user.organizationId`; never from body/query.
2. **Given** an organization user and a customer of another org, **When** accessing it, **Then** 404 CUSTOMER_NOT_FOUND.
3. **Given** a PLATFORM_OWNER, **When** listing customers, **Then** 200 with customers from any organization (bypass).
4. **Given** an OPERADOR, **When** creating/updating/deleting, **Then** 403 FORBIDDEN.
5. **Given** an unauthenticated request, **When** hitting a customer endpoint, **Then** 401.

### User Story 7 - P2: Audit logging
**Description**: Every customer write operation (create/update/delete) is recorded in the Audit table; failures never break the operation.

**Why this priority**: P2 — AD-001/002/003, RG-003 require user/date/action/module records.

**Acceptance Scenarios**:
1. **Given** a successful customer create/update/delete, **When** the operation completes, **Then** an Audit row exists with `module='customers'`, action `customer.create|update|delete.success`, `userId`, `organizationId` (from JWT), timestamp.
2. **Given** a rejected operation (duplicate codcli, forbidden role, not found), **When** it fails, **Then** an Audit row records `customer.*.failure` with non-sensitive metadata.
3. **Given** an Audit persistence failure, **When** the operation runs, **Then** the business operation still succeeds (audit never alters behavior).

## Requirements

### Functional Requirements

- **FR-001**: System MUST list customers scoped to the authenticated user's organization, paginated (`page`, `limit`), with meta `{page, limit, total, pages}` (API_GUIDELINES §10).
- **FR-002**: System MUST support a single search parameter `search` matching name, codcli, phone, or email (case-insensitive contains) (API_GUIDELINES §13).
- **FR-003**: System MUST support optional filters `status`, `city`, `createdFrom`, `createdTo`; filters are always optional (API_GUIDELINES §12).
- **FR-004**: System MUST support sorting via `sort` (`name`, `-createdAt`, etc.; "-" = descending) against a whitelist (API_GUIDELINES §11).
- **FR-005**: System MUST return a customer by id within the user's organization; cross-tenant and soft-deleted customers return 404 `CUSTOMER_NOT_FOUND`.
- **FR-006**: System MUST create customers with unique `(organizationId, codcli)`; duplicates return 409 CONFLICT (CL-001/002, 06-database:123).
- **FR-007**: System MUST allow updating contact fields; `codcli` is immutable after creation (HG-2).
- **FR-008**: System MUST soft-delete customers (set `deletedAt`/`deletedBy`); soft-deleted customers are hidden from normal queries; history is preserved (API_GUIDELINES §14, 06-database:328-332).
- **FR-009**: Customer write operations (create/update/delete) MUST be restricted to ADMINISTRADOR, GERENTE, and PLATFORM_OWNER; OPERADOR is read-only (HG-1).
- **FR-010**: PLATFORM_OWNER MUST specify `organizationId` when creating customers; the organization MUST exist (HG-10).
- **FR-011**: Organization users MUST NOT provide `organizationId`; the tenant scope comes exclusively from the JWT (NR-009/010).
- **FR-012**: Every customer write operation MUST be audited (`module='customers'`, action `customer.create|update|delete`, outcome, actor, organization) (AD-001/002, RG-003).

### Non-Functional / Security Requirements

- **NR-001**: Tenant scope is always derived from the authenticated JWT (`request.user.organizationId`); never from client input (NR-009/010).
- **NR-002**: Cross-tenant resource access returns 404 `CUSTOMER_NOT_FOUND` (non-enumerating; HG-3).
- **NR-003**: All customer endpoints require a valid JWT (`JwtAuthGuard`); unauthenticated requests return 401.
- **NR-004**: Audit metadata never contains passwords, tokens, or other sensitive data.
- **NR-005**: Audit failures never break or alter business operations (audit is best-effort).
- **NR-006**: Pagination limits are capped (max limit 100) to protect list endpoints.
- **NR-007**: List queries exclude soft-deleted records (`deletedAt: null`).
- **NR-008**: Phone is an optional free string with a length limit; no strict E.164 validation in v1 (HG-8).

## Customer Lifecycle

```
        [POST create]                [PATCH status/ERP sync]        [ERP deletion / sync]
              │                              │                              │
              v                              v                              v
          (ACTIVE) ─────────────────► (INACTIVE) ─────────────────► (INACTIVE, kept)
              │                                                         │
              └────────── [DELETE soft] ──────────────────────────► (deletedAt set,
                                                                     hidden from queries,
                                                                     history preserved)
```

- **ACTIVE**: default on creation; can receive campaigns/automations in future modules (CL-005/AU-005).
- **INACTIVE**: set via PATCH status (or future import sync); history preserved (03-business-rules:389-397).
- **BLOCKED**: reserved enum value, no v1 behavior (HG-7).
- **Soft deleted** (`deletedAt` set): hidden from list/get; never physically removed (06-database:328-332).

## Acceptance Scenarios

| Scenario | Precondition | Action | Expected Outcome |
|----------|-------------|--------|------------------|
| AS-001 | Org user with customers | GET /customers?page=1&limit=20 | 200; only own-org customers; meta `{page,limit,total,pages}` |
| AS-002 | Customer with name containing "juan" | GET /customers?search=juan | 200; matching customers only (case-insensitive) |
| AS-003 | Multiple customers | GET /customers?sort=-createdAt | 200; newest first |
| AS-004 | Soft-deleted customer exists | GET /customers / GET /customers/:id | List excludes it; detail returns 404 CUSTOMER_NOT_FOUND |
| AS-005 | Customer in another org | GET /customers/:id | 404 CUSTOMER_NOT_FOUND (no data leak) |
| AS-006 | Valid body | POST /customers | 201; customer created ACTIVE; audit `customer.create.success` |
| AS-007 | Existing (org, codcli) | POST /customers | 409 CONFLICT; audit `customer.create.failure` |
| AS-008 | OPERADOR writes | POST/PATCH/DELETE | 403 FORBIDDEN |
| AS-009 | PLATFORM_OWNER with valid organizationId | POST /customers | 201 in target org; list shows all orgs |
| AS-010 | PLATFORM_OWNER with unknown organizationId | POST /customers | 400 VALIDATION_ERROR |
| AS-011 | Org user sends organizationId | POST /customers | 400 VALIDATION_ERROR (tenant from JWT only) |
| AS-012 | Update contact fields | PATCH /customers/:id | 200; updatedAt/updatedBy set; audit `customer.update.success` |
| AS-013 | Change codcli | PATCH /customers/:id | 400 VALIDATION_ERROR (immutable, HG-2) |
| AS-014 | Soft delete | DELETE /customers/:id | 200 `{data:{success:true}}`; deletedAt/deletedBy set; audit `customer.delete.success` |
| AS-015 | Delete already soft-deleted | DELETE /customers/:id | 404 CUSTOMER_NOT_FOUND |
| AS-016 | No token | Any customer endpoint | 401 |
| AS-017 | Audit DB failure | Any customer write | Operation still succeeds; no error surfaced |

## Success Criteria *(mandatory)*

- **SC-001**: List endpoint returns only the actor's organization customers with correct pagination meta; filters, search, and sort behave per API_GUIDELINES.
- **SC-002**: codcli uniqueness holds per organization (409 on duplicate); codcli immutable after creation.
- **SC-003**: Cross-tenant and soft-deleted access return 404 CUSTOMER_NOT_FOUND; no data leaks across organizations.
- **SC-004**: Role matrix enforced: OPERADOR read-only (403 on writes); ADMINISTRADOR/GERENTE org-scoped writes; PLATFORM_OWNER cross-org writes with validated organizationId.
- **SC-005**: Soft delete preserves history; deleted records hidden from normal queries.
- **SC-006**: All write operations produce Audit rows (module=customers) with actor and organization from JWT; audit failures never break operations.
- **SC-007**: Customers module reaches ≥ 80% coverage; all scenarios AS-001..AS-017 pass.

## Explicit Out-of-Scope Items

- ❌ Customer import (Excel/CSV/ERP) — separate Import module (IM-001..IM-006, 04-domain-model "Agregado Importación")
- ❌ Domain events (CustomerImported/Updated/Activated/Deactivated/PhoneUpdated) — no event infrastructure in v1 (HG-6)
- ❌ Purchases and conversations exposure on customer detail — future modules (Purchases/Conversations)
- ❌ `tag` filter (`?tag=vip` in API_GUIDELINES §12) — no tags field in the data model
- ❌ BLOCKED status behavior — reserved (HG-7)
- ❌ Strict phone validation (E.164) — deferred to campaigns/automations consumers of CL-006
- ❌ Reporting (Módulo 08) and "Clientes pendientes de contacto" report (CL-006) — future module
- ❌ Customer creation/update via ERP sync — the ERP never writes directly; imports are the future channel (RG-001/002)

## Known Conflicts / Decisions Pending

| Conflict | Source | Resolution |
|----------|--------|------------|
| Quickstart S8 expects 403 FORBIDDEN for cross-tenant resource access; Customers v1 uses 404 CUSTOMER_NOT_FOUND | specs/011-identity-v1/quickstart.md S8 vs. non-enumeration principle | **HUMAN GATE approved (HG-3)**: 404 CUSTOMER_NOT_FOUND for resource-level cross-tenant access; 403 remains for role denials. S8's literal scenario (client-provided organizationId on a list route) is already handled by ignoring client input. |
| API_GUIDELINES §17 lists roles "Owner/Administrator/Operator/Viewer"; Identity v1 approved ADMINISTRADOR/GERENTE/OPERADOR/PLATFORM_OWNER | API_GUIDELINES §17 vs. specs/011-identity-v1 decisions | Customers v1 uses the Identity v1 role set (already resolved there). |
| API_GUIDELINES §12 shows `?tag=vip` customer filter; no tags field exists | API_GUIDELINES §12 vs. schema.prisma Customer | Filter not implemented in v1; documented as out of scope. |
| 03-business-rules CL "cliente eliminado en ERP" → INACTIVO vs. API_GUIDELINES §14 soft delete | business rules vs. API guidelines | Both coexist: status INACTIVE via PATCH (or future import sync); DELETE is user-initiated soft delete. ERP deletion semantics belong to the Import module. |

---
