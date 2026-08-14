# Research: Customers v1

Phase 0 output for `specs/012-customers-v1`. Resolves the technical unknowns from the plan's Technical Context. Format per decision: Decision / Rationale / Alternatives considered.

## R-001: Tenant enforcement point

- **Decision**: Enforce tenant scope in the service layer: every Customer query receives the actor (`request.user`) and applies `where: { organizationId: user.organizationId }` for ORGANIZATION users; `PLATFORM_OWNER` (`accountType === 'PLATFORM'`, `organizationId === null`) bypasses the filter. `TenantScopeGuard` is NOT used for customers.
- **Rationale**: `TenantScopeGuard` (tenant-scope.guard.ts:26) hardcodes `params.id === user.organizationId` — it only works for routes whose `:id` is an organization id (e.g., `GET /organizations/:id`). Customer ids are resource ids, never org ids, so the guard would reject every request. Spec FR-011/NR-001 and identity research R-012 mandate orgId-in-every-query; the service layer is the correct single enforcement point for resource-scoped modules.
- **Alternatives considered**: generalizing `TenantScopeGuard` with a resource loader / custom param metadata (modifies shared core used by Organizations; explicitly excluded by the approved constraints "No modificar TenantScopeGuard"); relying on the guard's no-op path and trusting controller code (violates R-012's central enforcement principle).

## R-002: Cross-tenant response semantics

- **Decision**: Cross-tenant access to a customer resource (get/update/delete by id) returns `404` with `{ "error": { "code": "CUSTOMER_NOT_FOUND", "message": "Customer not found" } }`. Role denials return `403` `FORBIDDEN`.
- **Rationale**: HG-3 approved. 404 is non-enumerating (API_GUIDELINES §8 error example uses `CUSTOMER_NOT_FOUND`); the identity quickstart S8's literal 403 expectation was recorded as a resolved conflict in spec.md. The service uses `findFirst({ where: { id, organizationId } })` so existence is never disclosed across orgs.
- **Alternatives considered**: 403 `FORBIDDEN` for cross-tenant (rejected by HG-3; leaks that the resource exists); blanket 404 only (same outcome, but the explicit code matches the API guideline example).

## R-003: Role matrix (OPERADOR read-only)

- **Decision**: Writes (create/update/delete) require roles `ADMINISTRADOR`, `GERENTE`, or `PLATFORM_OWNER` via `@Roles(...)` on the handlers; reads are allowed for all authenticated org roles and PLATFORM_OWNER. OPERADOR attempts any write → `403` `FORBIDDEN`.
- **Rationale**: HG-1 approved. 05-user-flows.md:29-39 assigns the Asesor (→ OPERADOR) read/consultation duties; 01-mvp.md:41-53 assigns configuration/import/admin duties to Administrador.
- **Alternatives considered**: all org roles writable (contradicts actor model); only ADMINISTRADOR writable (GERENTE is a manager role expected to maintain the directory per Módulo 02 funcionalidades).

## R-004: codcli immutability

- **Decision**: `codcli` is rejected on update. `UpdateCustomerDto` does not declare it, and the service ignores/denies any attempt to change it (DTO whitelist rejects unknown fields → 400). `codcli` is required on create.
- **Rationale**: HG-2 approved. codcli is the ERP identity key (CL-001/002); changing it would break future import matching (CL-003) and historical traceability (06-database:123 composite unique).
- **Alternatives considered**: allowing codcli changes with uniqueness re-check (breaks ERP identity semantics; rejected by HG-2).

## R-005: Audit integration

- **Decision**: Reuse `AuditIdentityService` from `modules/auth` (exported by `AuthModule`). Additive change: `IdentityAuditInput` gains optional `module?: string` (default `'identity'`); `record()` writes `module: input.module ?? 'identity'`. Customers calls `record({ module: 'customers', action: 'customer.create|update|delete', outcome, userId, organizationId, description, metadata })`. `CustomersModule` imports `AuthModule`.
- **Rationale**: HG-9 approved. The service already provides sanitization (SENSITIVE_METADATA_KEYS), never-throw semantics, and Audit-row persistence; only the module label is hardcoded (audit.identity.service.ts:55). One additive optional parameter preserves all existing callers.
- **Alternatives considered**: a second audit service inside customers (duplicates sanitize/record logic; rejected); writing Audit rows directly with Prisma in CustomersService (bypasses sanitization and never-throw guarantees).

## R-006: Pagination contract

- **Decision**: `GET /customers` accepts `page` (int ≥ 1, default 1) and `limit` (int 1..100, default 20); response is `{ "data": Customer[], "meta": { "page", "limit", "total", "pages" } }` where `pages = ceil(total / limit)`.
- **Rationale**: API_GUIDELINES §10 defines exactly this meta shape for all collections; NR-006 caps the limit. This is the first collection endpoint in the codebase, so it establishes the pattern for future modules.
- **Alternatives considered**: cursor-based pagination (not specified in the guidelines; offset model is the documented contract).

## R-007: Filters, search, and sort

- **Decision**:
  - `search`: single parameter; case-insensitive `contains` on `name`, `codcli`, `phone`, `email` (OR) (API_GUIDELINES §13).
  - Filters (all optional): `status` (enum ACTIVE|INACTIVE — BLOCKED accepted but unused), `city` (contains, insensitive), `createdFrom`, `createdTo` (ISO dates, inclusive bounds on `createdAt`).
  - `sort`: whitelist `name`, `codcli`, `city`, `status`, `createdAt`, `updatedAt`; leading `-` means descending; default `createdAt` descending.
  - `tag` filter is NOT implemented (no field in the data model; recorded in spec.md known conflicts).
- **Rationale**: API_GUIDELINES §11-13 define these semantics; a whitelist prevents arbitrary Prisma `orderBy`/injection via query params (NR-006).
- **Alternatives considered**: free-form `orderBy` passthrough (injection risk); sort field `id` (not a user-meaningful sort key).

## R-008: Soft delete semantics

- **Decision**: `DELETE /customers/:id` sets `deletedAt` and `deletedBy` (actor id from JWT). Every query (list, get, update) adds `deletedAt: null`. A second delete of an already-soft-deleted customer returns 404. History rows (purchases/conversations/audit) are untouched.
- **Rationale**: API_GUIDELINES §14 and 06-database.md:328-332 mandate soft delete and "registros nunca eliminados físicamente"; HG-4 approved.
- **Alternatives considered**: physical delete (forbidden by spec); status-only change to INACTIVE (ERP-deletion semantics belong to the Import module; PATCH status remains available for direct status changes).

## R-009: Audit actor fields on Customer

- **Decision**: Additive migration adds `createdBy String? @map("created_by")`, `updatedBy String? @map("updated_by")`, `deletedBy String? @map("deleted_by")` to Customer, populated from `request.user.id` (JWT) on create/update/delete. Also adds `@@index([organizationId, status])` and `@@index([organizationId, createdAt])`.
- **Rationale**: HG-5 approved; API_GUIDELINES §15 requires actor fields on all entities; 06-database.md:336-353 requires indexes for lookup paths (estado, created_at). Nullable columns keep the migration additive and safe for existing rows.
- **Alternatives considered**: relying solely on the Audit table (loses per-row actor fields required by §15); not indexing status/createdAt (list filters would scan).

## R-010: No domain events in v1

- **Decision**: Customers v1 emits no events. No event infrastructure exists in the repository (no BullMQ/event-emitter packages). Event emission (CustomerImported/Updated/…) is deferred to the Import module.
- **Rationale**: HG-6 approved; introducing a message broker or emitter for a CRUD module would violate the plan's "no new infrastructure" constraint and the repo's zero-event current state.
- **Alternatives considered**: adding `@nestjs/event-emitter` for in-process CustomerCreated/Updated (new dependency; no consumers yet; deferred).

## R-011: Phone validation

- **Decision**: `phone` is an optional `string` (max 30 chars); no E.164 or digit-only validation in v1. `email` uses `@IsEmail()`; `name` required non-empty (max 200); `codcli` required (max 50); `address`/`city` optional (max 200).
- **Rationale**: HG-8 approved — CL-006's "valid phone" requirement applies to campaign participation (future module), not to directory CRUD. Length caps are pragmatic anti-abuse bounds; field lengths mirror the ERP-ish data shapes in 06-database.md:109-119.
- **Alternatives considered**: E.164 strict validation (rejected by HG-8; would reject ERP exports with formatted local numbers).

## R-012: PLATFORM_OWNER organizationId on create

- **Decision**: `CreateCustomerDto` declares optional `organizationId`. If the actor is ORGANIZATION and `organizationId` is present → `400` `VALIDATION_ERROR`. If the actor is PLATFORM and `organizationId` is absent → `400` `VALIDATION_ERROR`. If PLATFORM and present → organization must exist (`prisma.organization.findUnique`) else `400` `VALIDATION_ERROR`.
- **Rationale**: HG-10 approved; mirrors the invitations pattern (organizationId in body, validated against trusted context). Prevents tenant spoofing by org users (NR-001) and dangling platform creates.
- **Alternatives considered**: a separate platform-only DTO (two DTOs for one endpoint); ignoring organizationId for org users (silent, hides mistakes).

## R-013: Error codes

- **Decision**:
  - `404` `CUSTOMER_NOT_FOUND` "Customer not found" — get/update/delete on missing, cross-tenant, or soft-deleted customer (API_GUIDELINES §8 example).
  - `409` `CONFLICT` "A customer with this codcli already exists" — duplicate `(organizationId, codcli)` (CL-002).
  - `400` `BAD_REQUEST` — DTO validation failures (global ValidationPipe + filter mapping).
  - `400` `VALIDATION_ERROR` — service-level business validation (immutable codcli, org-user organizationId, unknown platform organizationId).
  - `403` `FORBIDDEN` "Forbidden" — role denials (RolesGuard / service).
  - `401` — missing/invalid token (JwtAuthGuard).
- **Rationale**: Matches the existing exception style (invitations/organizations) and the HTTP filter's DEFAULT_CODES; `CUSTOMER_NOT_FOUND` is the documented customer-specific code.
- **Alternatives considered**: generic NOT_FOUND (loses domain clarity); returning 409 as VALIDATION_ERROR (409 is the correct semantic for duplicate resources).

## R-014: Duplicate detection strategy

- **Decision**: Detect duplicates with a pre-check `findFirst({ where: { organizationId, codcli, deletedAt: null } })` returning 409, **and** handle Prisma `P2002` as a race-condition backstop (catch → 409). Query ordering uses `(organizationId, codcli)` composite unique.
- **Rationale**: CL-002/06-database:123 require the constraint; the pre-check gives a clean 409; the P2002 catch covers concurrent creates (single-connection tests won't hit it, but production will).
- **Alternatives considered**: pre-check only (race window); P2002 only (confusing for the common case).

## R-015: BLOCKED status

- **Decision**: `CustomerStatus.BLOCKED` is accepted by DTO validation but has no special v1 behavior; create defaults to `ACTIVE`; PATCH may set ACTIVE/INACTIVE/BLOCKED without extra rules.
- **Rationale**: HG-7 approved — the enum value exists in the schema; introducing behavior now would be speculative (no spec defines it).
- **Alternatives considered**: excluding BLOCKED from DTO enum (breaks future-proofing; harmless to accept).

## R-016: Query parameters as DTO

- **Decision**: List query params are validated via `QueryCustomersDto` (class-validator: `@Type(() => Number)` for page/limit, `@IsEnum` for status, `@IsDateString` for dates, `@IsIn` for sort) using the global ValidationPipe (transform: true).
- **Rationale**: The global pipe (`whitelist: true, transform: true`) already transforms and validates query DTOs; class-validator is the project standard (Zod unused — no new validation library).
- **Alternatives considered**: manual param parsing (violates 09-development-standards.md "nunca validar manualmente").

## R-017: No N+1 / query shape

- **Decision**: List uses two Prisma calls: `count({ where })` + `findMany({ where, orderBy, skip, take })` with identical `where`. Detail uses `findFirst`. No relations included in v1 (purchases/conversations are future modules).
- **Rationale**: NR-006 and 06-database.md:336-353 indexing; a single `findMany` with `include` is unnecessary without relations. Avoids N+1 by construction.
- **Alternatives considered**: `findManyAndCount` (not available in Prisma 6); including relations (out of v1 scope).
