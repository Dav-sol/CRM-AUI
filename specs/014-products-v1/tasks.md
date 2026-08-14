---

description: "Task list for Products v1 feature implementation"
---

# Tasks: Products v1

**Input**: Design documents from `/specs/014-products-v1/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests ARE included. Constitution X mandates unit + integration tests and >80% coverage; spec.md user stories each define an Independent Test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Numbering continues from Purchases v1 (T086-T101).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US7 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `apps/api/src/` (NestJS), Prisma: `apps/api/prisma/schema.prisma`
- Unit tests: `*.spec.ts` next to source (Jest rootDir `src`)
- E2E tests: `apps/api/test/` (jest-e2e.json)
- Feature module: `apps/api/src/modules/products/`

---

## Phase 0: Spec Kit & Contract

**Purpose**: Documentation + API contract (API_CONTRACT_FIRST — Constitution III)

- [ ] T102 Create `specs/014-products-v1/` kit: plan.md, spec.md (US1-US7, FR-001..012, NR-001..008, AS-001..018), research.md (R-001..015), data-model.md (HG-4 additive changes), quickstart.md (S1-S14), tasks.md, checklists/requirements.md, and `contracts/products-api.md` (5 endpoints, contract-first). **HUMAN GATES HG-1..HG-5 approved 2026-08-13**: full CRUD + soft DELETE; purchases keep summaries, purchase-create on soft-deleted product → 400 (no purchases change); code immutable; additive migration; no events/imports/deps.

---

## Phase 1: Data Model & Migration

**Purpose**: Additive schema changes approved by HUMAN GATE HG-4

- [ ] T103 Apply additive Product model changes per data-model.md §1 (add `createdBy`/`updatedBy`/`deletedBy` nullable columns and `@@index([organizationId, status])`) in `apps/api/prisma/schema.prisma`; create migration with `npx prisma migrate dev --create-only --name add_product_audit_fields` in `apps/api`, review the generated SQL (additive only; no other tables), then apply with `npx prisma migrate dev` and run `npx prisma generate`. **HUMAN GATE APPROVED 2026-08-13 (HG-4)**: additive only; review migration SQL; STOP on any destructive transformation.

---

## Phase 2: US1 — List products

- [ ] T104 [US1] Unit tests for ProductsService.findAll in `apps/api/src/modules/products/products.service.spec.ts`: tenant scope from JWT (own org only), PLATFORM_OWNER bypass, pagination meta {page, limit, total, pages}, limit cap, search (code/name/category, case-insensitive OR), status/category/createdFrom/createdTo filters (date-only inclusive day semantics for createdTo — NR-008), sort whitelist + `-createdAt` default, invalid sort → 400, soft-deleted products excluded (FR-001..004, FR-012, NR-006/007/008, R-007, R-009)
- [ ] T105 [US1] Implement ProductsService.findAll + QueryProductsDto in `apps/api/src/modules/products/` (research.md R-006, R-007, R-009, R-013)

---

## Phase 3: US2 — Get product by id

- [ ] T106 [US2] Unit tests for ProductsService.findById in `apps/api/src/modules/products/products.service.spec.ts`: own-org hit, cross-tenant → 404 PRODUCT_NOT_FOUND, unknown → 404, soft-deleted → 404, PLATFORM_OWNER any org (FR-005, R-002, R-008)
- [ ] T107 [US2] Implement ProductsService.findById (`findFirst` with organizationId for org users; id-only for PLATFORM_OWNER; both filter `deletedAt: null`)

---

## Phase 4: US3 — Create product

- [ ] T108 [US3] Unit tests for ProductsService.create in `apps/api/src/modules/products/products.service.spec.ts`: success (ACTIVE default, createdBy set), duplicate code → 409 CONFLICT (pre-check AND P2002 backstop; collision with soft-deleted row also → 409 — R-008/R-010), org user with organizationId → 400 VALIDATION_ERROR, PLATFORM_OWNER without organizationId → 400, PLATFORM_OWNER with unknown organizationId → 400, audit product.create.success/failure recorded (FR-006, FR-008, FR-009, FR-010, FR-011; R-010, R-011)
- [ ] T109 [US3] Implement ProductsService.create + CreateProductDto (research.md R-010, R-011, R-015)

---

## Phase 5: US4 — Update product

- [ ] T110 [US4] Unit tests for ProductsService.update in `apps/api/src/modules/products/products.service.spec.ts`: field update (name/category/status, updatedBy set), status change without transitions, code change rejected → 400, cross-tenant/unknown/soft-deleted → 404, audit product.update.success/failure (FR-007, HG-3, R-004, R-008)
- [ ] T111 [US4] Implement ProductsService.update + UpdateProductDto (immutable constraint for code; whitelist rejects code)

---

## Phase 6: US5 — Delete product (soft)

- [ ] T112 [US5] Unit tests for ProductsService.delete in `apps/api/src/modules/products/products.service.spec.ts`: soft delete sets deletedAt+deletedBy and returns success, hidden from subsequent findById/findAll, delete again → 404, cross-tenant → 404, audit product.delete.success/failure (FR-011, FR-012, R-008)
- [ ] T113 [US5] Implement ProductsService.delete (`update` with deletedAt: now()/deletedBy after a `findFirst({ id, organizationId, deletedAt: null })` existence check)

---

## Phase 7: US6 — Tenant isolation and authorization

- [ ] T114 [US6] Unit tests for ProductsController in `apps/api/src/modules/products/products.controller.spec.ts`: status codes per endpoint, @Roles metadata on write handlers (OPERADOR → 403), DELETE handler registered (200 success shape), response envelope {data} / {data, meta}, service rejection passthrough (FR-008, NR-003)
- [ ] T115 [US6] Implement ProductsController (class-level JwtAuthGuard; `@Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE')` on POST/PATCH/DELETE handlers), ProductsModule (imports PrismaModule + AuthModule), register in `apps/api/src/app.module.ts`. TenantScopeGuard NOT used (R-001; tenant enforcement in service)

**Checkpoint**: US1..US6 green (unit) — CRUD, isolation, and roles validated

---

## Phase 8: US7 — Audit integration

- [ ] T116 [US7] Unit tests proving audit never breaks operations: AuditIdentityService.record rejects → create/update/delete still succeed and return correct responses (NR-005, spec AS-017)

---

## Phase 9: Integration & E2E

- [ ] T117 E2E suite in `apps/api/test/products.e2e-spec.ts`: seed org1/org2 + roles + bcrypt users + customers + products (pattern customers/purchases e2e); scenarios AS-001..AS-018: pagination/filters/search/sort on real DB, CRUD per role matrix (OPERADOR 403 on writes incl. DELETE), 409 duplicate code, 404 cross-tenant, soft-delete hidden (get/list/PATCH/DELETE → 404), PLATFORM_OWNER cross-org list + create with valid/invalid organizationId, code immutable (PATCH → 400), audit rows with module='products' written with correct actor/org, purchases integration (list purchase still shows product summary after soft delete; POST /purchases with soft-deleted product → 400 — no purchases code change)

---

## Phase 10: Contract & Polish

- [ ] T118 Fill OpenAPI contracts: `specs/api/paths/products.yaml` (5 endpoints — GET list, GET :id, POST, PATCH, DELETE) and `specs/api/components/schemas/Product/` (Product, ProductSummary, ProductDetails, ProductResponse, ProductListResponse, CreateProductRequest, UpdateProductRequest) per `contracts/products-api.md`, with 400 shapes matching the verified filter behavior (oneOf DTO passthrough | business envelope where both apply; DTO-only where the endpoint has no business validation) — API_CONTRACT_FIRST (Constitution III)
- [ ] T119 Run `quickstart.md` validation scenarios S1-S14 (products) in `apps/api`
- [ ] T120 Coverage review: unit + integration >80% for `modules/products` (Constitution X); run `npm run lint`, `npm run build`, typecheck, `jest`, `jest --config ./test/jest-e2e.json --runInBand`, combined coverage via `jest --config ./test/jest-combined.json --runInBand --silent --coverage`