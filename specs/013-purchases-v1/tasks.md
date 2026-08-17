---

description: "Task list for Purchases v1 feature implementation"
---

# Tasks: Purchases v1

**Input**: Design documents from `/specs/013-purchases-v1/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests ARE included. Constitution X mandates unit + integration tests and >80% coverage; spec.md user stories each define an Independent Test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Numbering continues from Customers v1 (T001-T085).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US6 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `apps/api/src/` (NestJS), Prisma: `apps/api/prisma/schema.prisma`
- Unit tests: `*.spec.ts` next to source (Jest rootDir `src`)
- E2E tests: `apps/api/test/` (jest-e2e.json)
- Feature module: `apps/api/src/modules/purchases/`

---

## Phase 1: Data Model & Migration

**Purpose**: Additive schema changes approved by HUMAN GATE HG-5

- [x] T086 Apply additive Purchase model changes per data-model.md §1 (add createdBy/updatedBy nullable columns and @@index([organizationId, status]), @@index([organizationId, purchaseDate])) in apps/api/prisma/schema.prisma; create migration with `npx prisma migrate dev --create-only --name add_purchase_audit_fields` in apps/api, review the generated SQL (additive only; no other tables), then apply with `npx prisma migrate dev` and run `npx prisma generate`. **HUMAN GATE APPROVED 2026-08-13 (HG-5)**: additive only; review migration SQL; STOP on any destructive transformation. No deletedBy (HG-4)

---

## Phase 2: US1 — List purchases

- [x] T087 [US1] Unit tests for PurchasesService.findAll in apps/api/src/modules/purchases/purchases.service.spec.ts: tenant scope from JWT (own org only), PLATFORM_OWNER bypass, pagination meta {page, limit, total, pages}, limit cap, search (invoiceNumber, case-insensitive), customerId/productId/status/dateFrom/dateTo filters, sort whitelist + `-purchaseDate` default, invalid sort → 400, inline customer/product summaries (FR-001..004, NR-006/008, R-007, R-009)
- [x] T088 [US1] Implement PurchasesService.findAll + QueryPurchasesDto in apps/api/src/modules/purchases/ (research.md R-006, R-007, R-009, R-015)

---

## Phase 3: US2 — Get purchase by id

- [x] T089 [US2] Unit tests for PurchasesService.findById in apps/api/src/modules/purchases/purchases.service.spec.ts: own-org hit with customer/product summaries, cross-tenant → 404 PURCHASE_NOT_FOUND, unknown → 404 PURCHASE_NOT_FOUND, PLATFORM_OWNER any org (FR-005, R-002)
- [x] T090 [US2] Implement PurchasesService.findById (findFirst with organizationId for org users; id-only for PLATFORM_OWNER; include customer/product select)

---

## Phase 4: US3 — Create purchase

- [x] T091 [US3] Unit tests for PurchasesService.create in apps/api/src/modules/purchases/purchases.service.spec.ts: success (COMPLETED default, createdBy set, value round-trip string), duplicate tuple → 409 CONFLICT, concurrent duplicate via Prisma P2002 → 409, org user with organizationId → 400 VALIDATION_ERROR, PLATFORM_OWNER without organizationId → 400, PLATFORM_OWNER with unknown organizationId → 400, unknown/cross-tenant customerId → 400, unknown/cross-tenant productId → 400, audit purchase.create.success/failure recorded (FR-006, FR-008, FR-010, FR-011, FR-012; R-010, R-011, R-012)
- [x] T092 [US3] Implement PurchasesService.create + CreatePurchaseDto (research.md R-008, R-010, R-011, R-012)

---

## Phase 5: US4 — Update purchase

- [x] T093 [US4] Unit tests for PurchasesService.update in apps/api/src/modules/purchases/purchases.service.spec.ts: field update (updatedBy set), status change without transitions, invoiceNumber change rejected → 400, customerId/productId attempts rejected → 400, cross-tenant/unknown → 404, audit purchase.update.success/failure (FR-007, HG-7, R-004, R-013)
- [x] T094 [US4] Implement PurchasesService.update + UpdatePurchaseDto (immutable constraint for invoiceNumber; whitelist rejects customerId/productId)

---

## Phase 6: US5 — Tenant isolation and authorization

- [x] T095 [US5] Unit tests for PurchasesController in apps/api/src/modules/purchases/purchases.controller.spec.ts: status codes per endpoint, @Roles metadata on write handlers (OPERADOR → 403), NO delete handler registered, response envelope {data} / {data, meta}, service rejection passthrough (FR-009, FR-013, NR-003)
- [x] T096 [US5] Implement PurchasesController (class-level JwtAuthGuard; @Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE') on POST/PATCH handlers), PurchasesModule (imports PrismaModule + AuthModule), register in apps/api/src/app.module.ts. TenantScopeGuard NOT used (R-001; tenant enforcement in service)

**Checkpoint**: US1..US5 green (unit) — CRUD, isolation, and roles validated

---

## Phase 7: US6 — Audit integration

- [x] T097 [US6] Unit tests proving audit never breaks operations: AuditIdentityService.record rejects → create/update still succeed and return correct responses (NR-005, spec AS-017)

---

## Phase 8: Integration & E2E

- [x] T098 E2E suite in apps/api/test/purchases.e2e-spec.ts: seed org1/org2 + roles + bcrypt users + customers + products (pattern customers.e2e-spec.ts); scenarios AS-001..AS-017: pagination/filters/search/sort on real DB, CRUD per role matrix (OPERADOR 403 on writes), 409 duplicate tuple (CP-005), 404 cross-tenant (user of org2 on org1 purchase), customer/product cross-tenant → 400, PLATFORM_OWNER cross-org list + create with valid/invalid organizationId, PATCH status change, invoiceNumber immutable, DELETE route absent (404), audit rows with module='purchases' written with correct actor/org

---

## Phase 9: Contract & Polish

- [x] T099 Fill OpenAPI contracts: specs/api/paths/purchases.yaml (4 endpoints — no DELETE) and specs/api/components/schemas/Purchase/ (Purchase, PurchaseSummary, PurchaseDetails, PurchaseResponse, PurchaseListResponse, CreatePurchaseRequest, UpdatePurchaseRequest) per contracts/purchases-api.md (API_CONTRACT_FIRST — Constitution III)
- [x] T100 Run quickstart.md validation scenarios S1-S12 (purchases) in apps/api
- [x] T101 Coverage review: unit + integration >80% for modules/purchases (Constitution X); run `npm run lint`, `npm run build`, typecheck, `jest`, `jest --config ./test/jest-e2e.json --runInBand`, combined coverage via `jest --config ./test/jest-combined.json --runInBand --silent --coverage`