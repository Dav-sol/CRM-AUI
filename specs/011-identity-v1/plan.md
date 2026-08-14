# Implementation Plan: Identity v1

**Branch**: `011-identity-v1` | **Date**: 2026-08-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-identity-v1/spec.md`

## Summary

Identity v1 establishes the authentication and authorization foundation for Automatize It Platform: login with JWT access tokens and refresh tokens delivered via HttpOnly cookies, revocable sessions through a UserSession concept, password reset, and user invitation flows. It defines two authorization scopes (PLATFORM_OWNER as a global role with `organizationId=null`; organization users ADMINISTRADOR/GERENTE/OPERADOR bound to exactly one organization), enforces tenant isolation derived from authenticated identity, and prevents account enumeration and cross-tenant access.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict), Node.js 24

**Primary Dependencies**: NestJS 11, Prisma 6.16 + PostgreSQL, bcrypt, passport + passport-jwt, @nestjs/jwt, cookie-parser, class-validator + class-transformer, @nestjs/config + joi (env validation)

**Storage**: PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`)

**Testing**: Jest + ts-jest (unit: `*.spec.ts` under `src`; e2e: supertest via `test/jest-e2e.json`)

**Target Platform**: Linux server, HTTP API under `/api/v1` (NestJS API in `apps/api`)

**Project Type**: web-service (B2B SaaS multi-tenant backend, monorepo with Turborepo)

**Performance Goals**: Login/token issuance < 500ms p95; refresh flow < 300ms p95; no requirement for horizontal scale in v1 beyond existing architecture

**Constraints**:
- Tenant isolation: `organizationId` never trusted from client; always from JWT
- Refresh tokens only as hashes in storage; delivered only via HttpOnly cookies
- Cross-tenant access forbidden; PLATFORM_OWNER bypasses org checks
- Account enumeration must be prevented (uniform error responses)
- Access tokens short-lived, refresh tokens long-lived (concrete values in `research.md`)
- Existing API response envelope: `{ data: {}, meta: {}, links: {} }`; errors `{ error: { code, message, details? } }`; HTTP codes per API_GUIDELINES.md

**Scale/Scope**: Identity v1 only — authentication, authorization, tenant isolation, session lifecycle, invitation lifecycle, password reset. No Organizations CRUD, no RBAC administration, no MFA, no social login.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Notes |
|------------------------|--------|-------|
| I. SPEC-DRIVEN DEVELOPMENT | PASS | Plan derived solely from `specs/011-identity-v1/spec.md`; conflicts recorded in spec's "Known Conflicts" section are carried forward, not silently resolved |
| II. DOMAIN AND ARCHITECTURAL DISCIPLINE | PASS | NestJS modules (Controller -> Service -> Repository -> DB), no new architecture introduced |
| III. API CONTRACT FIRST | PASS | Endpoints defined in `contracts/` before implementation; reuses existing response envelope and OpenAPI conventions |
| IV. MULTI-TENANCY | PASS | organizationId derived from authenticated identity; cross-tenant access forbidden; PLATFORM_OWNER operates across orgs |
| V. IDENTITY AND AUTHORIZATION | **APPROVED** | Two scopes implemented; no Viewer/Asesor/legacy roles introduced. **Prisma schema currently uses `RoleType { ADMINISTRADOR, GERENTE, ASESOR }` and `User.organizationId` is non-nullable — conflicts with the approved role set (OPERADOR, PLATFORM_OWNER) and PLATFORM_OWNER-without-organization. Schema change required (see data-model.md). HUMAN GATE approved 2026-08-13: ASESOR→OPERADOR, PLATFORM_OWNER not tenant-bound.** |
| VI. JWT AND SESSION SECURITY | PASS | JWT claims (sub, userId, accountType, organizationId, role); UserSession model; hashed refresh tokens; SUSPENDED/deletedAt cannot renew |
| VII. IDENTITY FLOWS | PASS | login, password reset, invitation; INVITED cannot log in; single-use time-limited tokens; invitation privileges by role |
| VIII. DATA SAFETY AND MIGRATIONS | **APPROVED** | Migration adds `UserSession` and modifies `User`/`RoleType`/`Audit`. Migration review required before execution; HUMAN GATE approved 2026-08-13 — proceed with migration safety steps (inspect data, backfill check, review SQL, STOP on unapproved destructive transformation) |
| IX. VALIDATION, ERRORS, AND SECURITY | PASS | DTOs + class-validator; controlled NestJS exceptions; uniform anti-enumeration errors; secrets via env only |
| X. TESTING AND QUALITY GATES | PASS | Unit + integration tests per flow; coverage target >80%; lint/typecheck/format required |
| XI. CHANGE CONTROL | PASS | Scope limited to Identity v1; Conventional Commits |
| XII. GOVERNANCE | PASS | Conflicts surfaced explicitly, not reconciled silently |

**GATE RESULT**: PASS. Three flagged items were APPROVED by explicit human decision on 2026-08-13: (1) `RoleType` mapping — existing `ASESOR` roles migrate to `OPERADOR`, preserving User→Role relationships and Role IDs where constraints allow, no silent deletion; (2) `User` model change — PLATFORM_OWNER is not tenant-bound (`accountType=PLATFORM`, `organizationId=NULL`, role `PLATFORM_OWNER`, no reserved organization); nullable columns are NOT optional tenant membership for organization users; (3) `Audit.organizationId` nullability — platform/system scope, never from client input. Migration strategy approved; migration may proceed with the safety steps.

**Post-Design Re-check (after Phase 1)**: Re-validated after generating `research.md`, `data-model.md`, `contracts/`, `quickstart.md`. No new violations introduced. Design adds `Invitation` and `PasswordResetToken` persistence models — required by the finalized spec's single-use/time-limited token semantics (FR-008, FR-012); documented in `data-model.md` with rationale. No new roles, permissions, or business capabilities introduced. Enum change (RoleType) approved by human on 2026-08-13. GATE remains PASS.

## Project Structure

### Documentation (this feature)

```text
specs/011-identity-v1/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output: resolved technical decisions
├── data-model.md        # Phase 1 output: entity model
├── quickstart.md        # Phase 1 output: validation guide
├── contracts/           # Phase 1 output: API contract
│   └── identity-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma              # [flagged] add UserSession; modify User/Role
├── src/
│   ├── core/
│   │   ├── config/                # add JWT_REFRESH_SECRET, REFRESH_COOKIE_NAME, lifetimes
│   │   │   ├── configuration.ts
│   │   │   └── env.validation.ts  # add refresh-token/invitation env vars
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts      # passport-jwt guard (app-level)
│   │   │   └── roles.guard.ts         # role + accountType check
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   └── middleware/             # cookie-parser registration in main.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.service.spec.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── jwt-refresh.strategy.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── refresh-token.dto.ts
│   │   │   │   ├── request-password-reset.dto.ts
│   │   │   │   └── confirm-password-reset.dto.ts
│   │   │   └── tokens/
│   │   │       ├── token.service.ts        # sign/verify access & refresh
│   │   │       ├── token.service.spec.ts
│   │   │       └── refresh-token-hasher.ts # sha256 hashing
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.service.spec.ts
│   │   │   └── user-sessions.service.ts    # UserSession persistence/revocation
│   │   ├── invitations/
│   │   │   ├── invitations.module.ts
│   │   │   ├── invitations.controller.ts
│   │   │   ├── invitations.service.ts
│   │   │   ├── invitations.service.spec.ts
│   │   │   └── dto/
│   │   │       ├── create-invitation.dto.ts
│   │   │       └── accept-invitation.dto.ts
│   │   └── password-reset/
│   │       ├── password-reset.module.ts
│   │       ├── password-reset.controller.ts
│   │       ├── password-reset.service.ts
│   │       ├── password-reset.service.spec.ts
│   │       └── dto/
│   │           ├── request-reset.dto.ts
│   │           └── confirm-reset.dto.ts
│   └── app.module.ts               # register new modules
```

**Structure Decision**: Feature modules inside the existing `apps/api/src/modules/` layout, following the existing module pattern (module/controller/service + spec files). Cross-cutting JWT/session concerns live in `src/core/` (guards, decorators) alongside the existing core infrastructure. This matches the repository's current conventions; no new packages created.

## Complexity Tracking

> Filled because Constitution Check has gated items that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `User` model modification (nullable organizationId / accountType) | PLATFORM_OWNER is a user without an organization; spec mandates accountType=PLATFORM, organizationId=null | A separate `PlatformUser` table would duplicate identity/session logic and fragment authentication; one `User` model with nullable org fields preserves a single identity path |
| `RoleType` enum change (ASESOR -> OPERADOR, add PLATFORM_OWNER) | Spec and Constitution V are authoritative: roles are ADMINISTRADOR, GERENTE, OPERADOR + PLATFORM_OWNER; existing ASESOR is a legacy value | Keeping ASESOR would contradict the approved decisions; legacy data mapping APPROVED by human on 2026-08-13 (HUMAN GATE) |
| New `UserSession` model | Spec FR-014/NR-004: refresh tokens persisted only as hashes in a revocable session record | Stateless-only refresh tokens cannot be revoked, violating session security requirements |

---

## Phase 0/1 Outputs

Phase 0 (`research.md`) and Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`) are generated as separate artifacts in this directory.
