# Implementation Plan: Customers v1

**Branch**: `main` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-customers-v1/spec.md`; domain requirements from `specs/03-business-rules.md`, `specs/04-domain-model.md`, `specs/05-user-flows.md`, `specs/06-database.md`, `specs/02-modules.md`, `specs/api/API_GUIDELINES.md`

## Summary

Customers v1 implements the customer directory of the platform: paginated listing with filters/search/sort, detail view, creation, update, and soft delete — all tenant-scoped to the authenticated organization and role-restricted (OPERADOR read-only). It is the first business-domain CRUD module and the first paginated collection endpoint, establishing the `{data, meta}` collection pattern for future modules. The `Customer` Prisma model already exists; the module adds audit fields (`createdBy`/`updatedBy`/`deletedBy`) and lookup indexes via an additive migration, and reuses the Auth module's `AuditIdentityService` with an additive `module?: string` parameter.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, class-validator + class-transformer, @nestjs/config + joi (env validation). No new runtime dependencies.

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`), model `Customer` (schema.prisma:83-106), enum `CustomerStatus` (ACTIVE, INACTIVE, BLOCKED)

**Testing**: Jest + ts-jest (unit: `*.spec.ts` under `src`; e2e: supertest via `test/jest-e2e.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: List endpoint p95 < 500ms for orgs with tens of thousands of customers; `count` + `findMany` on indexed columns (`organizationId`, `status`, `createdAt`)

**Constraints**:
- Tenant isolation: `organizationId` never trusted from client; always from JWT (NR-009/010; identity R-012)
- Cross-tenant resource access → 404 `CUSTOMER_NOT_FOUND` (HG-3); role denials → 403
- `TenantScopeGuard` MUST NOT be modified (it compares `params.id` to `organizationId` and is unsuitable for resource ids); tenant enforcement lives in the service layer
- No Zod; class-validator DTOs only
- No event infrastructure introduced (HG-6)
- Identity v1 code is not refactored; the only change is the additive `module?: string` parameter in `AuditIdentityService` (HG-9)
- Response envelope `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8)

**Scale/Scope**: Customers v1 only — CRUD, list/filter/search/pagination, soft delete, tenant isolation, roles, audit. No imports, no events, no purchases/conversations exposure, no reports.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived from `specs/012-customers-v1/spec.md` + domain specs; conflicts recorded in spec's "Known Conflicts" section |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS module (Controller -> Service -> Prisma) mirroring `modules/organizations`; no new architecture |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/customers-api.md` and OpenAPI before implementation |
| IV. MULTI-TENANCY | PASS | organizationId from JWT only; cross-tenant → 404; PLATFORM_OWNER bypass; OPERADOR read-only |
| V. IDENTITY AND AUTHORIZATION | PASS | Reuses Identity v1 roles (ADMINISTRADOR, GERENTE, OPERADOR, PLATFORM_OWNER) and guards (JwtAuthGuard, RolesGuard) |
| VI. JWT AND SESSION SECURITY | PASS | JwtAuthGuard on all customer endpoints; no new token/session logic |
| VII. IDENTITY FLOWS | PASS | Not applicable (no identity flows in Customers v1); audit reuses identity audit infrastructure |
| VIII. DATA SAFETY AND MIGRATIONS | PASS | **HUMAN GATE approved (HG-5)**: additive migration only — nullable `createdBy`/`updatedBy`/`deletedBy` + indexes on Customer; no destructive transformations; migration SQL reviewed before apply |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | class-validator DTOs; controlled exceptions; uniform `CUSTOMER_NOT_FOUND`; audit metadata sanitized; no credentials in logs |
| X. TESTING AND QUALITY GATES | PASS | Unit tests per user story + e2e; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Customers v1 + the approved additive audit parameter; Conventional Commits |
| XII. GOVERNANCE | PASS | HUMAN GATES HG-1..HG-10 approved 2026-08-13 and recorded in spec.md clarifications |

**GATE RESULT**: PASS. HUMAN GATES HG-1..HG-10 approved verbatim on 2026-08-13 (OPERADOR read-only; codcli immutable; cross-tenant 404 CUSTOMER_NOT_FOUND; soft delete; additive migration with createdBy/updatedBy/deletedBy; no events; BLOCKED reserved; phone free string; AuditIdentityService `module?` additive parameter; PLATFORM_OWNER organizationId validated to exist).

**Post-Design Re-check (after Phase 1)**: Re-validated after generating `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/012-customers-v1/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output: resolved technical decisions
├── data-model.md        # Phase 1 output: entity model
├── quickstart.md        # Phase 1 output: validation guide
├── contracts/           # Phase 1 output: API contract
│   └── customers-api.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma              # [approved HG-5] Customer: add createdBy/updatedBy/deletedBy + indexes
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   └── audit.identity.service.ts   # [approved HG-9] additive module?: string param
│   │   └── customers/              # NEW module
│   │       ├── customers.module.ts
│   │       ├── customers.controller.ts
│   │       ├── customers.controller.spec.ts
│   │       ├── customers.service.ts
│   │       ├── customers.service.spec.ts
│   │       └── dto/
│   │           ├── create-customer.dto.ts
│   │           ├── update-customer.dto.ts
│   │           └── query-customers.dto.ts
│   └── app.module.ts               # register CustomersModule
└── test/
    └── customers.e2e-spec.ts       # e2e suite (test/jest-e2e.json)
```

## Complexity Tracking

> Filled because Constitution Check has gated items that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `Customer` model modification (createdBy/updatedBy/deletedBy) | API_GUIDELINES §15 mandates actor audit fields on all entities | Omitting them leaves no actor trace on the row; the Audit table alone lacks per-entity actor fields required by the guidelines |
| `AuditIdentityService` signature change (`module?`) | Customer audit rows must identify `module='customers'`; the service hardcodes `'identity'` | A second audit service in customers would duplicate sanitization/persistence logic; an optional parameter is additive and non-breaking (default `'identity'`) |

---

## Phase 0/1 Outputs

Phase 0 (`research.md`) and Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`) are generated as separate artifacts in this directory.