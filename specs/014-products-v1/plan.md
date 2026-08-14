# Implementation Plan: Products v1

**Branch**: `main` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-products-v1/spec.md`; domain requirements from `specs/04-domain-model.md` (Producto), `specs/06-database.md` (Product, Soft Delete, Índices, Integridad, Escalabilidad), `specs/02-modules.md` (Módulo 03 — Compras: campo Producto), `specs/03-business-rules.md` (CA-003 segmentación), `specs/07-event-architecture.md` (ProductImported, ProductUpdated), `specs/api/API_GUIDELINES.md`, approved decisions from `specs/013-purchases-v1` (HG-3 productId validation, R-011)

## Summary

Products v1 implements the product catalog module: paginated listing with filters/search/sort, detail view, creation, update, and soft delete — tenant-scoped to the authenticated organization and role-restricted (OPERADOR read-only). The `Product` Prisma model already exists (created in migration `20260810000529_add_domain_entities`); the module adds audit actor fields (`createdBy`/`updatedBy`/`deletedBy`) and one lookup index via an additive migration (HG-4), and reuses the Auth module's `AuditIdentityService` with `module: 'products'`. Products v1 is the first CRUD module with a DELETE (soft) endpoint — the generic soft-delete rule (06-database.md:328-333, API_GUIDELINES §5/§14) applies because no domain rule protects products from deletion (unlike CP-004 for purchases, HG-2).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, @nestjs/config + joi (env validation). No new runtime dependencies (HG-5).

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), model `Product` (schema.prisma:113-131), enum `ProductStatus` (ACTIVE, INACTIVE — schema.prisma:431-434), unique `(organizationId, code)` (schema.prisma:128)

**Testing**: Jest + ts-jest (unit: `*.spec.ts` under `src`; e2e: supertest via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: List endpoint must not N+1 (single `count` + `findMany` on `products`, both filtered on `organizationId`; the table is indexed per 06-database.md:336-353). Products volume is small relative to customers/purchases (06-database.md:388-398 lists millions of clients/purchases/messages, not products); search uses `contains` without pg_trgm (no new dependencies, HG-5).

**Constraints**:
- Tenant isolation: `organizationId` never trusted from client; always from JWT (API_GUIDELINES §18; HG-1)
- Cross-tenant resource access → 404 `PRODUCT_NOT_FOUND` (HG-1, precedent R-002 customers / R-002 purchases); role denials → 403
- `TenantScopeGuard` MUST NOT be used (precedent R-001 purchases); tenant enforcement lives in the service layer
- No Zod; class-validator DTOs only (precedent)
- No event infrastructure introduced (HG-5); `ProductImported`/`ProductUpdated` (07-event-architecture.md:154-159) deferred to the future Import module; no Importer
- DELETE endpoint IS part of v1 (HG-2): soft delete via `deletedAt`/`deletedBy`; purchases keep historical product summaries; creating a purchase referencing a soft-deleted product → 400 (existing purchases R-011 already filters `deletedAt: null`; **no purchases code change**)
- `code` immutable after creation (HG-3; mirror of purchases invoiceNumber R-004)
- Existing modules are NOT modified; the only cross-module touch is `app.module.ts` registration of `ProductsModule`
- Response envelope `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- `createdFrom`/`createdTo` accept date-only input with whole-day-inclusive semantics (pattern fixed in purchases, commit `dca47bc`)

**Scale/Scope**: Products v1 only — list/filter/search/pagination, detail, create, update (status changes, no transitions workflow), soft delete, tenant isolation, roles, audit. No imports (ProductImported), no events, no campaigns/automations, no category catalog (future Módulo 10 Configuración), no inventory (01-mvp.md:128 "Inventario" fuera del MVP).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (`04-domain-model.md` Producto, `06-database.md` Product) + `specs/014-products-v1/spec.md`; no module exists in `02-modules.md` → HG-1 approved scope; conflicts recorded in spec's "Known Conflicts" section |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service -> Prisma) mirroring `modules/customers` / `modules/purchases` (approved v1 pattern); no new architecture |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/products-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; cross-tenant → 404 PRODUCT_NOT_FOUND; PLATFORM_OWNER bypass with validated organizationId on POST; OPERADOR read-only |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles (ADMINISTRADOR, GERENTE, OPERADOR, PLATFORM_OWNER) and guards (JwtAuthGuard, RolesGuard) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all product endpoints; no new token/session logic |
| VII. IDENTITY FLOWS | PASS | Not applicable (no identity flows in Products v1); audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE approved (HG-4)**: additive migration only — nullable `createdBy`/`updatedBy`/`deletedBy` + `@@index([organizationId, status])` on Product; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions; uniform `PRODUCT_NOT_FOUND`; audit metadata sanitized; no credentials in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Products v1 (customers/purchases untouched, only app.module registration); Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-5 approved 2026-08-13 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-5 approved verbatim on 2026-08-13 (CRUD manual completo con DELETE soft — 5 endpoints, patrón customers; compras históricas conservan summary del producto, crear compra con producto soft-deleted → 400 sin cambios en purchases; code inmutable tras creación; migración aditiva createdBy/updatedBy/deletedBy + 1 índice; sin eventos/Imports/dependencias nuevas; spec kit 014 completo T102+ con fuentes).

**Post-Design Re-check (after Phase 1)**: Re-validated after generating `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/014-products-v1/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output: resolved technical decisions
├── data-model.md        # Phase 1 output: entity model
├── quickstart.md        # Phase 1 output: validation guide
├── contracts/           # Phase 1 output: API contract
│   └── products-api.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma              # [approved HG-4] Product: add createdBy/updatedBy/deletedBy + 1 index
├── src/
│   ├── modules/
│   │   └── products/              # NEW module
│   │       ├── products.module.ts
│   │       ├── products.controller.ts
│   │       ├── products.controller.spec.ts
│   │       ├── products.service.ts
│   │       ├── products.service.spec.ts
│   │       └── dto/
│   │           ├── create-product.dto.ts
│   │           ├── update-product.dto.ts
│   │           └── query-products.dto.ts
│   └── app.module.ts              # register ProductsModule
└── test/
    └── products.e2e-spec.ts       # e2e suite (test/jest-e2e.json)
```

## Complexity Tracking

> Filled because Constitution Check has gated items that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `Product` model modification (createdBy/updatedBy/deletedBy) | API_GUIDELINES §15 mandates actor audit fields on all entities; HG-4 approved additive migration | Omitting them leaves no actor trace on the row; the Audit table alone lacks per-entity actor fields required by the guidelines |
| DELETE endpoint (soft) for products | API_GUIDELINES §5/§14 and 06-database.md:328-333 mandate soft delete for all entities; no domain rule protects products from deletion (unlike CP-004 for purchases); HG-2 approved | Omitting DELETE forces INACTIVE misuse for hiding records and contradicts the generic soft-delete rule |

---