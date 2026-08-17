---

description: "Task list for Customers v1 feature implementation"
---

# Tasks: Customers v1

**Input**: Design documents from `/specs/012-customers-v1/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests ARE included. Constitution X mandates unit + integration tests and >80% coverage; spec.md user stories each define an Independent Test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Numbering continues from Identity v1 (T001-T066).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US7 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `apps/api/src/` (NestJS), Prisma: `apps/api/prisma/schema.prisma`
- Unit tests: `*.spec.ts` next to source (Jest rootDir `src`)
- E2E tests: `apps/api/test/` (jest-e2e.json)
- Feature module: `apps/api/src/modules/customers/`

---

## Phase 1: Data Model & Migration

**Purpose**: Additive schema changes approved by HUMAN GATE HG-5

- [x] T067 Apply additive Customer model changes per data-model.md §1 (add createdBy/updatedBy/deletedBy nullable columns and @@index([organizationId, status]), @@index([organizationId, createdAt])) in apps/api/prisma/schema.prisma, run `npx prisma migrate dev --name add_customer_audit_fields` in apps/api. **HUMAN GATE APPROVED 2026-08-13 (HG-5)**: additive only; review generated migration SQL; STOP on any destructive transformation

---

## Phase 2: Foundational (Audit Infrastructure)

**Purpose**: Additive reuse of the identity audit service (HUMAN GATE HG-9)

- [x] T068 [P] Add optional `module?: string` parameter to `IdentityAuditInput` and use it in `record()` (default `'identity'`) in apps/api/src/modules/auth/audit.identity.service.ts (research.md R-005). No other identity code changes

**Checkpoint**: Schema + audit foundation ready

---

## Phase 3: US1 — List customers

- [x] T069 [US1] Unit tests for CustomersService.findAll in apps/api/src/modules/customers/customers.service.spec.ts: tenant scope from JWT (own org only), PLATFORM_OWNER bypass, pagination meta {page, limit, total, pages}, limit cap, search (name/codcli/phone/email, case-insensitive), status/city/createdFrom/createdTo filters, sort whitelist + `-createdAt` default, soft-deleted excluded (FR-001..004, NR-006/007)
- [x] T070 [US1] Implement CustomersService.findAll + QueryCustomersDto in apps/api/src/modules/customers/ (research.md R-006, R-007, R-016, R-017)

---

## Phase 4: US2 — Get customer by id

- [x] T071 [US2] Unit tests for CustomersService.findById in apps/api/src/modules/customers/customers.service.spec.ts: own-org hit, cross-tenant → 404 CUSTOMER_NOT_FOUND, soft-deleted → 404 CUSTOMER_NOT_FOUND, PLATFORM_OWNER any org (FR-005, HG-3, R-002)
- [x] T072 [US2] Implement CustomersService.findById (findFirst with organizationId + deletedAt: null for org users; id-only for PLATFORM_OWNER)

---

## Phase 5: US3 — Create customer

- [x] T073 [US3] Unit tests for CustomersService.create in apps/api/src/modules/customers/customers.service.spec.ts: success (ACTIVE, createdBy set), duplicate (organizationId, codcli) → 409 CONFLICT, concurrent duplicate via Prisma P2002 → 409, org user with organizationId → 400 VALIDATION_ERROR, PLATFORM_OWNER without organizationId → 400, PLATFORM_OWNER with unknown organizationId → 400, audit customer.create.success/failure recorded (FR-006, FR-010, FR-011, FR-012; R-012, R-014)
- [x] T074 [US3] Implement CustomersService.create + CreateCustomerDto (research.md R-012, R-014)

---

## Phase 6: US4 — Update customer

- [x] T075 [US4] Unit tests for CustomersService.update in apps/api/src/modules/customers/customers.service.spec.ts: contact-field update (updatedBy set), codcli change rejected → 400 VALIDATION_ERROR, cross-tenant/soft-deleted → 404, audit customer.update.success/failure (FR-007, HG-2, R-004)
- [x] T076 [US4] Implement CustomersService.update + UpdateCustomerDto (no codcli field — whitelist rejects it)

---

## Phase 7: US5 — Soft delete customer

- [x] T077 [US5] Unit tests for CustomersService.remove in apps/api/src/modules/customers/customers.service.spec.ts: soft delete sets deletedAt/deletedBy, second delete → 404, soft-deleted excluded from list/get, audit customer.delete.success/failure (FR-008, HG-4, R-008)
- [x] T078 [US5] Implement CustomersService.remove (update deletedAt/deletedBy; findFirst with org scope)

---

## Phase 8: US6 — Tenant isolation and authorization

- [x] T079 [US6] Unit tests for CustomersController in apps/api/src/modules/customers/customers.controller.spec.ts: status codes per endpoint, @Roles metadata on write handlers (OPERADOR → 403), response envelope {data} / {data, meta}, service rejection passthrough (FR-009, NR-003)
- [x] T080 [US6] Implement CustomersController (class-level JwtAuthGuard; @Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE') on POST/PATCH/DELETE handlers), CustomersModule (imports PrismaModule + AuthModule), register in apps/api/src/app.module.ts. TenantScopeGuard NOT used (R-001; tenant enforcement in service)

**Checkpoint**: US1..US6 green (unit) — CRUD, isolation, and roles validated

---

## Phase 9: US7 — Audit integration

- [x] T081 [US7] Unit tests proving audit never breaks operations: AuditIdentityService.record rejects → create/update/delete still succeed and return correct responses (NR-005, spec AS-017)

---

## Phase 10: Integration & E2E

- [x] T082 E2E suite in apps/api/test/customers.e2e-spec.ts: seed org + 3 roles + bcrypt users (pattern tenant-isolation.e2e-spec.ts); scenarios AS-001..AS-017: pagination/filters/search/sort on real DB, CRUD per role matrix (OPERADOR 403 on writes), 409 duplicate, 404 cross-tenant (user of org2 on org1 customer), PLATFORM_OWNER cross-org list + create with valid/invalid organizationId, soft-delete hidden, audit rows with module='customers' written with correct actor/org

---

## Phase 11: Contract & Polish

- [x] T083 Fill OpenAPI contracts: specs/api/paths/customers.yaml (5 endpoints) and specs/api/components/schemas/Customer/ (Customer, CustomerSummary, CustomerDetails, CustomerResponse, CustomerListResponse, CreateCustomerRequest, UpdateCustomerRequest) per contracts/customers-api.md (API_CONTRACT_FIRST — Constitution III)
- [x] T084 Run quickstart.md validation scenarios S1-S12 (customers) in apps/api
- [x] T085 Coverage review: unit + integration >80% for modules/customers (Constitution X); run `npm run lint`, `npm run build`, typecheck, `jest`, `jest --config ./test/jest-e2e.json --runInBand`