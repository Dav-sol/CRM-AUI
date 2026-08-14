# Implementation Plan: Purchases v1

**Branch**: `main` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-purchases-v1/spec.md`; domain requirements from `specs/01-mvp.md` (Gestión de Compras), `specs/02-modules.md` (Módulo 03 — Compras), `specs/03-business-rules.md` (CP-001..CP-005, AD-001..003, Restricciones), `specs/04-domain-model.md` (Compra, invariantes), `specs/05-user-flows.md` (Flujo 03), `specs/06-database.md` (Purchase, índices, restricciones), `specs/07-event-architecture.md` (PurchaseImported), `specs/api/API_GUIDELINES.md`

## Summary

Purchases v1 implements the purchase records module: paginated listing with filters/search/sort, detail view, creation, and update — tenant-scoped to the authenticated organization and role-restricted (OPERADOR read-only). Per CP-004 a purchase is **never deleted**; there is no DELETE endpoint. The `Purchase` Prisma model already exists (created in migration `20260810000529_add_domain_entities`); the module adds audit actor fields (`createdBy`/`updatedBy`) and lookup indexes via an additive migration (HG-5), and reuses the Auth module's `AuditIdentityService` with `module: 'purchases'`. This is the first module using Prisma `Decimal` (money), serialized as string per HG-7.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL (Decimal via `decimal.js` bundled with Prisma), class-validator + class-transformer, @nestjs/config + joi (env validation). No new runtime dependencies.

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), model `Purchase` (schema.prisma:133-160), enum `PurchaseStatus` (COMPLETED, CANCELLED, REFUNDED), `value Decimal @db.Decimal(12, 2)` (schema.prisma:142)

**Testing**: Jest + ts-jest (unit: `*.spec.ts` under `src`; e2e: supertest via `test/jest-e2e.json`; combined coverage via `test/jest-combined.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: List endpoint must not N+1 (single `findMany` with `include` of customer/product summaries, both FK-indexed); `count` + `findMany` on indexed columns (`organizationId`, `purchaseDate`, `invoiceNumber`, `status` per 06-database.md:336-353) for orgs with millions of purchases (06-database.md:388-402).

**Constraints**:
- Tenant isolation: `organizationId` never trusted from client; always from JWT (API_GUIDELINES §18; HG-2)
- Cross-tenant resource access → 404 `PURCHASE_NOT_FOUND` (HG-2, precedent R-002 customers); role denials → 403
- `TenantScopeGuard` MUST NOT be used (it compares `params.id` to `organizationId` and is unsuitable for resource ids); tenant enforcement lives in the service layer (precedent R-001 customers)
- No Zod; class-validator DTOs only (precedent)
- No event infrastructure introduced (HG-6); no Automations (AU-001 deferred), no Importer (PurchaseImported deferred)
- No DELETE endpoint (HG-4; CP-004); `deletedAt` stays inert, `deletedBy` NOT added
- No Products module (HG-3): `productId` validated for existence and tenant access only
- Existing modules are NOT modified; the only cross-module touch is `app.module.ts` registration of `PurchasesModule` (no audit service change needed — `module?` param already exists from Customers v1)
- Response envelope `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)
- Money serialized as string; validation regex `^\d{1,10}(\.\d{1,2})?$` (HG-7)

**Scale/Scope**: Purchases v1 only — list/filter/search/pagination, detail, create, update (status changes, no transitions workflow), tenant isolation, roles, audit. No delete, no products CRUD, no events, no automations, no imports, no reports, no CommercialCycle management.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from base domain specs (`03-business-rules.md` CP-001..005, `06-database.md` Purchase) + `specs/013-purchases-v1/spec.md`; conflicts recorded in spec's "Known Conflicts" section |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service -> Prisma) mirroring `modules/customers` (v1 pattern); no new architecture |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/purchases-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; cross-tenant → 404 PURCHASE_NOT_FOUND; PLATFORM_OWNER bypass with validated organizationId on POST; OPERADOR read-only |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles (ADMINISTRADOR, GERENTE, OPERADOR, PLATFORM_OWNER) and guards (JwtAuthGuard, RolesGuard) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all purchase endpoints; no new token/session logic |
| VII. IDENTITY FLOWS | PASS | Not applicable (no identity flows in Purchases v1); audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE approved (HG-5)**: additive migration only — nullable `createdBy`/`updatedBy` + `@@index([organizationId, status])`, `@@index([organizationId, purchaseDate])` on Purchase; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions; uniform `PURCHASE_NOT_FOUND`; money validated as decimal string; audit metadata sanitized; no credentials in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Purchases v1 (customers untouched, only app.module registration); Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-8 approved 2026-08-13 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-8 approved verbatim on 2026-08-13 (POST/PATCH manuales; OPERADOR read-only + PLATFORM_OWNER organizationId validado; Products fuera de alcance con validación de existencia; sin DELETE — CP-004 prevalece, deletedAt inerte, sin deletedBy; migración aditiva createdBy/updatedBy + 2 índices; sin eventos/AU-001/PurchaseImported; value = total de línea, Decimal como string, máx 10 enteros + 2 decimales, status libre vía PATCH, invoiceNumber inmutable; spec kit 013 completo T086+ con fuentes).

**Post-Design Re-check (after Phase 1)**: Re-validated after generating `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/013-purchases-v1/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output: resolved technical decisions
├── data-model.md        # Phase 1 output: entity model
├── quickstart.md        # Phase 1 output: validation guide
├── contracts/           # Phase 1 output: API contract
│   └── purchases-api.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma              # [approved HG-5] Purchase: add createdBy/updatedBy + 2 indexes
├── src/
│   ├── modules/
│   │   └── purchases/             # NEW module
│   │       ├── purchases.module.ts
│   │       ├── purchases.controller.ts
│   │       ├── purchases.controller.spec.ts
│   │       ├── purchases.service.ts
│   │       ├── purchases.service.spec.ts
│   │       └── dto/
│   │           ├── create-purchase.dto.ts
│   │           ├── update-purchase.dto.ts
│   │           └── query-purchases.dto.ts
│   └── app.module.ts              # register PurchasesModule
└── test/
    └── purchases.e2e-spec.ts      # e2e suite (test/jest-e2e.json)
```

## Complexity Tracking

> Filled because Constitution Check has gated items that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `Purchase` model modification (createdBy/updatedBy) | API_GUIDELINES §15 mandates actor audit fields on all entities; HG-5 approved additive migration | Omitting them leaves no actor trace on the row; the Audit table alone lacks per-entity actor fields required by the guidelines |
| Money as string + `Prisma.Decimal` | HG-7 approved: API serializes Decimal as string to avoid precision loss; the DB column is `Decimal(12,2)` (schema.prisma:142) | Sending raw `number` would lose precision beyond 2 decimals in JS float round-trips |

---
