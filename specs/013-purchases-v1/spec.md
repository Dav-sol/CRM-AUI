# Feature Specification: Purchases v1

**Feature**: Purchases v1 — Purchase records management
**Short name**: `purchases-v1`
**Created**: 2026-08-13
**Status**: Draft
**Input**: User approved plan `specs/013-purchases-v1/plan.md`; domain sources `specs/02-modules.md` (Módulo 03), `specs/03-business-rules.md` (CP-001..CP-005), `specs/04-domain-model.md` (Compra), `specs/06-database.md` (Purchase)

## User Scenarios & Testing *(mandatory)*

**Clarifications Session: 2026-08-13** (HUMAN GATES HG-1..HG-8, approved verbatim)

- Q1: Does Purchases v1 include manual POST and PATCH? → A1: Yes. HG-1 approved: v1 includes manual registration (01-mvp.md:88 "Registro") and update (status changes included). Creation via ERP import (PurchaseImported) belongs to the future Import module (07-event-architecture.md:42; HG-6).

- Q2: Which roles may write purchases? → A2: HG-2 approved: OPERADOR is read-only (403 on writes). ADMINISTRADOR and GERENTE may create/update within their organization. PLATFORM_OWNER operates cross-org; POST requires `organizationId` validated against an existing organization. Organization users always use `organizationId` from the JWT (API_GUIDELINES §18).

- Q3: Is a Products module part of Purchases v1? → A3: No (HG-3). `productId` is required and validated to exist and be accessible within the tenant; Products CRUD is out of scope.

- Q4: Is DELETE part of Purchases v1? → A4: No (HG-4). CP-004 (03-business-rules.md:113-119): "Una compra nunca debe eliminarse. Solo podrá cambiar de estado." CP-004 prevails over the generic soft-delete rule (06-database.md:328-333). The `deletedAt` column already exists in the model and stays **inert**; `deletedBy` is NOT added.

- Q5: What exactly is added to the Purchase model? → A5: HG-5 approved: `createdBy` and `updatedBy` (nullable, actor id from JWT) plus `@@index([organizationId, status])` and `@@index([organizationId, purchaseDate])` (06-database.md:336-353 mandates estado/created_at lookup indexes). Additive migration, `--create-only`, SQL review before apply.

- Q6: Are domain events emitted? → A6: No (HG-6). No event infrastructure exists; `PurchaseImported` (07-event-architecture.md:42) and AU-001 automation generation (03-business-rules.md:177-183) are explicitly future responsibilities of the Importer/Automations modules.

- Q7: What is the semantics and serialization of `value`? → A7: HG-7 approved: `value` is the TOTAL value of the purchase/line as recorded. The API serializes Decimal as string. Validation: max 10 integer digits and 2 decimals (`^\d{1,10}(\.\d{1,2})?$`). `status` changes via PATCH without restrictive transitions in v1. `invoiceNumber` is immutable after creation.

- Q8: How is purchase audit logging implemented? → A8: Reuse `AuditIdentityService` with `module: 'purchases'` (the additive `module?: string` parameter already exists from Customers v1 HG-9). Actions `purchase.create|update` + `.success|.failure`. No delete actions (no DELETE).

---

### User Story 1 - P1: List purchases with pagination, filters, and search
**Description**: Users list purchases of their organization with pagination, optional filters (customerId, productId, status, purchaseDate range), single search parameter, and sorting.

**Why this priority**: P1 — historial de compras is the entry point of the module (02-modules.md:96 "Historial"; 01-mvp.md:89 "Historial").

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/purchases?page=1&limit=20 → 200 with only own-organization purchases, meta `{page, limit, total, pages}`; `?search=`, `?customerId=`, `?productId=`, `?status=`, `?dateFrom=`, `?dateTo=`, `?sort=-purchaseDate` applied.

**Acceptance Scenarios**:
1. **Given** an organization user with purchases in their org, **When** they GET /purchases, **Then** only their org's purchases are returned, paginated with correct meta.
2. **Given** the search parameter `?search=INV-001`, **When** listing, **Then** purchases whose invoiceNumber contains the term (case-insensitive) are returned.
3. **Given** `?customerId=<id>`, `?productId=<id>`, `?status=COMPLETED`, `?dateFrom=`, `?dateTo=`, **When** listing, **Then** only matching purchases are returned (filters always optional, API_GUIDELINES §12).
4. **Given** `?sort=-purchaseDate`, **When** listing, **Then** results are ordered newest purchase first.

### User Story 2 - P1: Get purchase by id
**Description**: Users view a purchase's full record (with customer and product summaries) within their organization.

**Why this priority**: P1 — consulta de compra is a core read path (01-mvp.md:90 "Consulta").

**Independent Test**: Login as ADMINISTRADOR → GET /api/v1/purchases/:id → 200 with purchase data incl. customer{id,codcli,name} and product{id,code,name}; purchase of another org → 404 PURCHASE_NOT_FOUND.

**Acceptance Scenarios**:
1. **Given** a purchase in the user's org, **When** GET /purchases/:id, **Then** 200 with the purchase record and customer/product summaries.
2. **Given** a purchase id of another organization, **When** GET /purchases/:id, **Then** 404 `PURCHASE_NOT_FOUND` (non-enumerating).
3. **Given** an unknown purchase id, **When** GET /purchases/:id, **Then** 404 `PURCHASE_NOT_FOUND`.

### User Story 3 - P1: Create purchase
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER create purchases within the tenant scope derived from the JWT.

**Why this priority**: P1 — registro de compras (02-modules.md:92 "Registrar todas las compras realizadas por cada cliente"; 01-mvp.md:88 "Registro").

**Independent Test**: Login as ADMINISTRADOR → POST /purchases {customerId, productId, invoiceNumber, purchaseDate, quantity, value} → 201 with purchase; same duplicate key → 409 CONFLICT (CP-005); OPERADOR → 403; PLATFORM_OWNER with valid organizationId → 201; unknown customerId/productId → 400.

**Acceptance Scenarios**:
1. **Given** valid body, **When** POST /purchases, **Then** 201 with the created purchase (default status COMPLETED, `createdBy` set).
2. **Given** an existing `(organizationId, invoiceNumber, customerId, productId, purchaseDate)` tuple, **When** POST /purchases again, **Then** 409 CONFLICT (CP-005; schema.prisma:154).
3. **Given** an OPERADOR user, **When** POST /purchases, **Then** 403 FORBIDDEN (HG-2).
4. **Given** a customerId not in the tenant (or unknown), **When** POST /purchases, **Then** 400 VALIDATION_ERROR (HG-3 tenant access validation).
5. **Given** a productId not in the tenant (or unknown), **When** POST /purchases, **Then** 400 VALIDATION_ERROR (HG-3).
6. **Given** a PLATFORM_OWNER, **When** POST /purchases with valid `organizationId`, **Then** 201; purchase belongs to that organization.
7. **Given** a PLATFORM_OWNER, **When** POST /purchases with missing or unknown `organizationId`, **Then** 400 VALIDATION_ERROR (HG-2).
8. **Given** an organization user, **When** POST /purchases with `organizationId` in body, **Then** 400 VALIDATION_ERROR (tenant never from client).

### User Story 4 - P1: Update purchase
**Description**: ADMINISTRADOR, GERENTE, and PLATFORM_OWNER update purchase fields; invoiceNumber is immutable; status may change without restrictive transitions.

**Why this priority**: P1 — status changes are the only allowed mutation per CP-004 ("Solo podrá cambiar de estado"); field corrections complete the write surface (HG-1).

**Acceptance Scenarios**:
1. **Given** an existing purchase in the user's org, **When** PATCH /purchases/:id with valid fields, **Then** 200 with the updated purchase; `updatedAt` changes; `updatedBy` set.
2. **Given** a body attempting to change `invoiceNumber`, **When** PATCH /purchases/:id, **Then** 400 (immutable, HG-7).
3. **Given** a purchase id of another org or unknown, **When** PATCH, **Then** 404 PURCHASE_NOT_FOUND.
4. **Given** an OPERADOR, **When** PATCH, **Then** 403 FORBIDDEN.
5. **Given** `{"status": "CANCELLED"}`, **When** PATCH, **Then** 200; status updated (no workflow transitions in v1, HG-7).

### User Story 5 - P1: Tenant isolation and authorization
**Description**: All purchase queries are scoped to the JWT `organizationId`; PLATFORM_OWNER operates across organizations; role restrictions enforced.

**Why this priority**: P1 — data isolation is the core security requirement (API_GUIDELINES §18; AGENTS.md Multi-Tenancy).

**Acceptance Scenarios**:
1. **Given** an organization user, **When** any purchase query executes, **Then** the `organizationId` filter comes exclusively from `request.user.organizationId`; never from body/query.
2. **Given** an organization user and a purchase of another org, **When** accessing it, **Then** 404 PURCHASE_NOT_FOUND.
3. **Given** a PLATFORM_OWNER, **When** listing purchases, **Then** 200 with purchases from any organization (bypass).
4. **Given** an OPERADOR, **When** creating/updating, **Then** 403 FORBIDDEN.
5. **Given** an unauthenticated request, **When** hitting a purchase endpoint, **Then** 401.

### User Story 6 - P2: Audit logging
**Description**: Every purchase write operation (create/update) is recorded in the Audit table; failures never break the operation.

**Why this priority**: P2 — AD-001/002 (03-business-rules.md:330-346) require user/date/action/module records.

**Acceptance Scenarios**:
1. **Given** a successful purchase create/update, **When** the operation completes, **Then** an Audit row exists with `module='purchases'`, action `purchase.create|update.success`, `userId`, `organizationId` (from JWT), timestamp.
2. **Given** a rejected operation (duplicate, forbidden role, not found), **When** it fails, **Then** an Audit row records `purchase.*.failure` with non-sensitive metadata.
3. **Given** an Audit persistence failure, **When** the operation runs, **Then** the business operation still succeeds (audit never alters behavior).

## Requirements

### Functional Requirements

- **FR-001**: System MUST list purchases scoped to the authenticated user's organization, paginated (`page`, `limit`), with meta `{page, limit, total, pages}` (API_GUIDELINES §10).
- **FR-002**: System MUST support a single search parameter `search` matching invoiceNumber (case-insensitive contains) (API_GUIDELINES §13).
- **FR-003**: System MUST support optional filters `customerId`, `productId`, `status`, `dateFrom`, `dateTo` (purchaseDate range); filters are always optional (API_GUIDELINES §12).
- **FR-004**: System MUST support sorting via `sort` (`purchaseDate`, `-invoiceNumber`, etc.; "-" = descending) against a whitelist (API_GUIDELINES §11).
- **FR-005**: System MUST return a purchase by id within the user's organization; cross-tenant and unknown purchases return 404 `PURCHASE_NOT_FOUND`.
- **FR-006**: System MUST create purchases with unique `(organizationId, invoiceNumber, customerId, productId, purchaseDate)`; duplicates return 409 CONFLICT (CP-005, schema.prisma:154).
- **FR-007**: System MUST allow updating mutable purchase fields; `invoiceNumber` is immutable after creation (HG-7).
- **FR-008**: System MUST validate that `customerId` and `productId` exist and are accessible within the tenant on create (HG-3).
- **FR-009**: Purchase write operations (create/update) MUST be restricted to ADMINISTRADOR, GERENTE, and PLATFORM_OWNER; OPERADOR is read-only (HG-2).
- **FR-010**: PLATFORM_OWNER MUST specify `organizationId` when creating purchases; the organization MUST exist (HG-2).
- **FR-011**: Organization users MUST NOT provide `organizationId`; the tenant scope comes exclusively from the JWT (API_GUIDELINES §18).
- **FR-012**: Every purchase write operation MUST be audited (`module='purchases'`, action `purchase.create|update`, outcome, actor, organization) (AD-001/002).
- **FR-013**: System MUST NOT provide any DELETE operation for purchases (CP-004; HG-4).

### Non-Functional / Security Requirements

- **NR-001**: Tenant scope is always derived from the authenticated JWT (`request.user.organizationId`); never from client input (API_GUIDELINES §18).
- **NR-002**: Cross-tenant resource access returns 404 `PURCHASE_NOT_FOUND` (non-enumerating).
- **NR-003**: All purchase endpoints require a valid JWT (`JwtAuthGuard`); unauthenticated requests return 401.
- **NR-004**: Audit metadata never contains passwords, tokens, or other sensitive data.
- **NR-005**: Audit failures never break or alter business operations (audit is best-effort).
- **NR-006**: Pagination limits are capped (max limit 100) to protect list endpoints.
- **NR-007**: `value` is serialized as string and validated as money: max 10 integer digits, 2 decimals (HG-7).
- **NR-008**: List queries must not N+1; customer/product summaries are fetched in a single query per page (06-database.md:388-402).

## Purchase Lifecycle

```
        [POST create]                    [PATCH status — no transitions workflow in v1]
              │                                        │
              v                                        v
          COMPLETED ────────────────────────────► CANCELLED / REFUNDED
              │                                        │
              └──────── (never deleted — CP-004, HG-4) ┘
```

- **COMPLETED**: default on creation (schema.prisma:143).
- **CANCELLED / REFUNDED**: set via PATCH `status`; no restrictive transitions in v1 (HG-7).
- **Never deleted**: no DELETE endpoint; `deletedAt` column stays inert (HG-4; CP-004 prevails over 06-database.md:328-333).

## Acceptance Scenarios

| Scenario | Precondition | Action | Expected Outcome |
|----------|-------------|--------|------------------|
| AS-001 | Org user with purchases | GET /purchases?page=1&limit=20 | 200; only own-org purchases; meta `{page,limit,total,pages}` |
| AS-002 | Purchase with invoiceNumber "INV-001" | GET /purchases?search=inv-001 | 200; matching purchases only (case-insensitive) |
| AS-003 | Multiple purchases | GET /purchases?sort=-purchaseDate | 200; newest purchase date first |
| AS-004 | Purchase in another org | GET /purchases/:id | 404 PURCHASE_NOT_FOUND (no data leak) |
| AS-005 | Valid body | POST /purchases | 201; purchase created COMPLETED; `createdBy` set; audit `purchase.create.success` |
| AS-006 | Existing duplicate tuple | POST /purchases | 409 CONFLICT; audit `purchase.create.failure` |
| AS-007 | OPERADOR writes | POST/PATCH | 403 FORBIDDEN |
| AS-008 | customerId of another org | POST /purchases | 400 VALIDATION_ERROR |
| AS-009 | productId of another org / unknown | POST /purchases | 400 VALIDATION_ERROR |
| AS-010 | PLATFORM_OWNER with valid organizationId | POST /purchases | 201 in target org; list shows all orgs |
| AS-011 | PLATFORM_OWNER with missing/unknown organizationId | POST /purchases | 400 VALIDATION_ERROR |
| AS-012 | Org user sends organizationId | POST /purchases | 400 VALIDATION_ERROR (tenant from JWT only) |
| AS-013 | Update mutable fields | PATCH /purchases/:id | 200; updatedAt/updatedBy set; audit `purchase.update.success` |
| AS-014 | Change invoiceNumber | PATCH /purchases/:id | 400 (immutable, HG-7) |
| AS-015 | Change status | PATCH /purchases/:id `{"status":"CANCELLED"}` | 200; status updated (no transitions workflow) |
| AS-016 | No token | Any purchase endpoint | 401 |
| AS-017 | Audit DB failure | Any purchase write | Operation still succeeds; no error surfaced |

## Success Criteria *(mandatory)*

- **SC-001**: List endpoint returns only the actor's organization purchases with correct pagination meta; filters, search, and sort behave per API_GUIDELINES.
- **SC-002**: Duplicate detection per CP-005 holds (409 on duplicate tuple); invoiceNumber immutable after creation.
- **SC-003**: Cross-tenant access returns 404 PURCHASE_NOT_FOUND; no data leaks across organizations.
- **SC-004**: Role matrix enforced: OPERADOR read-only (403 on writes); ADMINISTRADOR/GERENTE org-scoped writes; PLATFORM_OWNER cross-org writes with validated organizationId.
- **SC-005**: No DELETE endpoint exists; purchase records are never deleted (CP-004).
- **SC-006**: All write operations produce Audit rows (module=purchases) with actor and organization from JWT; audit failures never break operations.
- **SC-007**: Money round-trips losslessly as string (`value` = total, max 10+2 digits); purchases module reaches ≥ 80% coverage; all scenarios AS-001..AS-017 pass.

## Explicit Out-of-Scope Items

- ❌ DELETE for purchases — forbidden by CP-004 (HG-4)
- ❌ Products module — only existence/tenant validation of `productId` (HG-3)
- ❌ Domain events (`PurchaseImported`) — future Import module (07-event-architecture.md:42; HG-6)
- ❌ Automation generation (AU-001: 3 days/6 months/12 months) — future Automations module (HG-6)
- ❌ CommercialCycle management (04-domain-model.md:79-93) — future Automations module
- ❌ Purchase import (Excel/CSV/ERP) — separate Import module (IM-001..IM-006)
- ❌ `purchaseDate`/`value` derived fields (totals, per-period aggregates) — Dashboard/Reports modules
- ❌ Status transitions workflow (e.g., COMPLETED→REFUNDED restrictions) — none in v1 (HG-7)
- ❌ Purchase update of `customerId`/`productId` — kept immutable via tenant/audit consistency (see Known Conflicts)

## Known Conflicts / Decisions Pending

| Conflict | Source | Resolution |
|----------|--------|------------|
| CP-004 "Una compra nunca debe eliminarse" vs. generic soft delete "Todas las entidades utilizarán Soft Delete" | 03-business-rules.md:113-119 vs. 06-database.md:328-333 / API_GUIDELINES §14 | **HUMAN GATE approved (HG-4)**: CP-004 prevails. No DELETE endpoint. `deletedAt` column remains (already migrated) but inert; `deletedBy` not added. |
| "Compras" listed under "Fuera del MVP" vs. "Gestión de Compras" in the MVP | 01-mvp.md:126-131 vs. 01-mvp.md:86-92, 02-modules.md:88-110 | Interpreted: the out-of-scope "Compras" refers to procurement/facturación (03-business-rules.md:354-366 "El sistema NO administra... Compras... Estas funciones permanecen bajo responsabilidad del ERP"); purchase RECORDS are the Módulo 03 in scope. Recorded here as documented interpretation. |
| API_GUIDELINES §17 lists roles "Owner/Administrator/Operator/Viewer" vs. approved Identity v1 roles | API_GUIDELINES §17 vs. specs/011-identity-v1 decisions | Purchases v1 uses the Identity v1 role set (ADMINISTRADOR/GERENTE/OPERADOR/PLATFORM_OWNER), already resolved in Identity v1. |
| `value` semantics (line total vs unit price × quantity) not defined by domain sources | 02-modules.md:99-100 lists "Cantidad" and "Valor" without defining the relation | **HUMAN GATE approved (HG-7)**: `value` is the TOTAL value of the purchase/line as recorded; quantity is informational for the record. |
| `search` scope (invoiceNumber only vs. including customer name) | API_GUIDELINES §13 defines a single `search` param; 02-modules.md:96 lists Factura as a field | Decision R-007: v1 searches invoiceNumber only; customer filtering via explicit `customerId` filter (no customer-name search in v1). Documented inference. |
| PATCH of `customerId`/`productId` (moving a purchase to another customer) | Not defined by domain sources; CP-004 allows only status change | Decision R-013 (inference): customerId/productId immutable on update; PATCH limited to mutable fields. |

---