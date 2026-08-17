---

description: "Task list for Identity v1 feature implementation"
---

# Tasks: Identity v1

**Input**: Design documents from `/specs/011-identity-v1/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests ARE included. Constitution X mandates unit + integration tests and >80% coverage; spec.md user stories each define an Independent Test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US8 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `apps/api/src/` (NestJS), Prisma: `apps/api/prisma/schema.prisma`
- Unit tests: `*.spec.ts` next to source (Jest rootDir `src`)
- E2E tests: `apps/api/test/` (jest-e2e.json)
- Per plan.md structure: feature modules under `apps/api/src/modules/`, cross-cutting in `apps/api/src/core/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, environment configuration, middleware

- [x] T001 Add `@nestjs/jwt` dependency to apps/api/package.json (research.md R-001/R-013)
- [x] T002 [P] Add identity env vars (JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, INVITATION_TOKEN_TTL, PASSWORD_RESET_TOKEN_TTL, REFRESH_COOKIE_NAME, COOKIE_SECURE) to apps/api/src/core/config/env.validation.ts (research.md R-006)
- [x] T003 [P] Add identity config keys to apps/api/src/core/config/configuration.ts (research.md R-006)
- [x] T004 Register cookie-parser middleware in apps/api/src/main.ts (research.md R-007)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Review Prisma schema changes in apps/api/prisma/schema.prisma per data-model.md: make User.organizationId/roleId nullable, add User.accountType, add UserSession/Invitation/PasswordResetToken models, add AccountType/InvitationStatus enums, change RoleType (ASESOR→OPERADOR), make Audit.organizationId nullable (platform/system audit scope per AD-001 decision). **HUMAN GATE APPROVED 2026-08-13**: role mapping (ASESOR→OPERADOR, relationships preserved, Role IDs preserved where constraints allow, no silent deletion), PLATFORM_OWNER not tenant-bound (no reserved org, organizationId NULL), nullable User.organizationId/roleId with PLATFORM/ORGANIZATION invariants, and Audit.organizationId nullability explicitly approved — proceed per plan.md gates and migration safety steps
- [x] T006 Run `npx prisma migrate dev --name identity-v1` and generate client in apps/api (gate APPROVED 2026-08-13; inspect Role/User/Audit data, review generated migration SQL, STOP on unapproved destructive transformation per Constitution VIII)
- [x] T007 [P] Create RefreshTokenHasher (SHA-256 + timing-safe compare) in apps/api/src/modules/auth/tokens/refresh-token-hasher.ts (research.md R-002)
- [x] T008 Create TokenService (sign/verify access & refresh JWTs; claims: sub, userId, accountType, organizationId, role) in apps/api/src/modules/auth/tokens/token.service.ts (research.md R-001, R-010)
- [x] T009 Create JwtStrategy (passport-jwt, access token) in apps/api/src/modules/auth/strategies/jwt.strategy.ts (research.md R-001)
- [x] T010 Create JwtRefreshStrategy in apps/api/src/modules/auth/strategies/jwt-refresh.strategy.ts
- [x] T011 Create CurrentUserDecorator in apps/api/src/core/decorators/current-user.decorator.ts
- [x] T012 [P] Create RolesDecorator in apps/api/src/core/decorators/roles.decorator.ts and RolesGuard in apps/api/src/core/guards/roles.guard.ts (checks accountType + role per research.md R-011)
- [x] T013 Create JwtAuthGuard in apps/api/src/core/guards/jwt-auth.guard.ts (research.md R-012)
- [x] T014 Create UserSessionsService (create/rotate/revoke/validate; blocked for SUSPENDED/deletedAt) in apps/api/src/modules/users/user-sessions.service.ts (data-model.md §3; FR-007/NR-006)
- [x] T015 Create UsersModule and UsersService (email lookup, password hash with bcrypt cost 12) in apps/api/src/modules/users/users.module.ts and users.service.ts (research.md R-008)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Platform owner login (Priority: P1) 🎯 MVP

**Goal**: PLATFORM_OWNER logs in and receives an access token with `accountType=PLATFORM`, `organizationId=null`, `role=PLATFORM_OWNER` plus a refresh token in an HttpOnly cookie.

**Independent Test**: Login with PLATFORM_OWNER credentials; decode access token and verify the three claims; verify `Set-Cookie` with HttpOnly refresh cookie.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T016 [P] [US1] Unit test AuthService.login for PLATFORM_OWNER claims + uniform 401 anti-enumeration (unknown email == wrong password, Q4/A4) in apps/api/src/modules/auth/auth.service.spec.ts
- [x] T017 [P] [US1] Integration test POST /api/v1/auth/login (PLATFORM_OWNER success + 401 cases) in apps/api/test/auth.e2e-spec.ts

### Implementation for User Story 1

- [x] T018 [P] [US1] Create LoginDto (email, password; class-validator) in apps/api/src/modules/auth/dto/login.dto.ts
- [x] T019 [P] [US1] Create AuthModule in apps/api/src/modules/auth/auth.module.ts (JwtModule.registerAsync, strategies, TokenService, UserSessionsService)
- [x] T020 [US1] Implement AuthService.login in apps/api/src/modules/auth/auth.service.ts (bcrypt verify, session creation, access + refresh token issuance, cookie via controller; uniform INVALID_CREDENTIALS for all failures)
- [x] T021 [US1] Implement AuthController.login in apps/api/src/modules/auth/auth.controller.ts (returns access token + sets HttpOnly refresh cookie; never returns refresh token in body — FR-002)
- [x] T022 [US1] Register AuthModule in apps/api/src/app.module.ts
- [x] T023 [US1] Add logging for login events (no credentials in logs; Constitution IX) in apps/api/src/modules/auth/auth.service.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Organization user login (Priority: P1)

**Goal**: ADMINISTRADOR/GERENTE/OPERADOR log in and receive a JWT bound to exactly one organization (`accountType=ORGANIZATION`, `organizationId` required, role from Role table).

**Independent Test**: Login with each org role; verify `organizationId` equals the user's organization and role claim matches; verify org isolation in subsequent calls.

### Tests for User Story 2 ⚠️

- [x] T024 [P] [US2] Unit test AuthService.login for ADMINISTRADOR/GERENTE/OPERADOR claim resolution (role from Role relation) in apps/api/src/modules/auth/auth.service.spec.ts

### Implementation for User Story 2

- [x] T025 [US2] Implement organization role + organizationId resolution in AuthService.login for accountType=ORGANIZATION users in apps/api/src/modules/auth/auth.service.ts
- [x] T026 [US2] Integration test org user login (3 roles) + JWT claims in apps/api/test/auth.e2e-spec.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 7 - Session revocation via UserSession (Priority: P1)

**Goal**: Sessions are revocable; SUSPENDED or deletedAt users cannot renew; refresh rotation with reuse detection.

**Independent Test**: Login, refresh (rotation), reuse old refresh token → uniform error + session revoked; logout → refresh fails; SUSPENDED/deletedAt user refresh → 401.

### Tests for User Story 7 ⚠️

- [x] T027 [P] [US7] Unit tests for UserSessionsService (rotate, revoke, reuse detection, SUSPENDED/deletedAt blocking) in apps/api/src/modules/users/user-sessions.service.spec.ts
- [x] T028 [P] [US7] Integration test refresh + logout flow in apps/api/test/auth.e2e-spec.ts

### Implementation for User Story 7

- [x] T029 [US7] Implement AuthService.refresh in apps/api/src/modules/auth/auth.service.ts (rotation per research.md R-004; uniform INVALID_OR_EXPIRED_TOKEN per Q5/A5; internal logging of actual reason)
- [x] T030 [US7] Implement AuthController.refresh in apps/api/src/modules/auth/auth.controller.ts (cookie-based, no body)
- [x] T031 [US7] Implement AuthService.logout (sets revokedAt; clears cookie) in apps/api/src/modules/auth/auth.service.ts
- [x] T032 [US7] Implement AuthController.logout in apps/api/src/modules/auth/auth.controller.ts
- [x] T033 [US7] Wire renewal blocking: AuthService.refresh delegates SUSPENDED/deletedAt checks to UserSessionsService (T014) and returns 401 INVALID_CREDENTIALS for blocked sessions in apps/api/src/modules/auth/auth.service.ts (FR-007/NR-006)

**Checkpoint**: Session lifecycle complete; refresh/logout/revocation testable independently

---

## Phase 6: User Story 3 - Password reset (Priority: P2)

**Goal**: ACTIVE users reset passwords via single-use, time-limited tokens; INVITED blocked until ACTIVE; SUSPENDED/deleted blocked with specific errors; unknown emails get generic response (anti-enumeration).

**Independent Test**: Request reset (per-state matrix S12 in quickstart.md); confirm with token; token reuse → 400; old password invalidated.

### Tests for User Story 3 ⚠️

- [x] T034 [P] [US3] Unit tests for password reset state matrix (ACTIVE/INVITED/SUSPENDED/deleted/unknown) in apps/api/src/modules/password-reset/password-reset.service.spec.ts (Q1/A1, Q3/A3)
- [x] T035 [P] [US3] Integration test reset request + confirm flows in apps/api/test/password-reset.e2e-spec.ts

### Implementation for User Story 3

- [x] T036 [P] [US3] Create RequestResetDto and ConfirmResetDto in apps/api/src/modules/password-reset/dto/
- [x] T037 [P] [US3] Create PasswordResetModule + PasswordResetController in apps/api/src/modules/password-reset/
- [x] T038 [US3] Implement PasswordResetService.requestReset in apps/api/src/modules/password-reset/password-reset.service.ts (state matrix, generic 200 for unknown email, token hashed + persisted, TTL from env)
- [x] T039 [US3] Implement PasswordResetService.confirmReset in apps/api/src/modules/password-reset/password-reset.service.ts (single-use token, password update, uniform INVALID_OR_EXPIRED_TOKEN)
- [x] T040 [US3] Register PasswordResetModule in apps/api/src/app.module.ts

**Checkpoint**: Password reset fully functional and testable independently

---

## Phase 7: User Story 4 - Invitation by PLATFORM_OWNER (Priority: P2)

**Goal**: PLATFORM_OWNER invites users to any organization; INVITED cannot log in; acceptance creates the User (INVITED→ACTIVE per Q2/A2) and starts a session.

**Independent Test**: Create invitation (201) → INVITED login blocked (401 uniform) → accept → user ACTIVE with session; token reuse → 400.

### Tests for User Story 4 ⚠️

- [x] T041 [P] [US4] Unit tests invitation lifecycle (create/accept/expire/reuse; User creation timing per Q2/A2) in apps/api/src/modules/invitations/invitations.service.spec.ts
- [x] T042 [P] [US4] Integration test invitation flow (PLATFORM_OWNER to any org) in apps/api/test/invitations.e2e-spec.ts

### Implementation for User Story 4

- [x] T043 [P] [US4] Create CreateInvitationDto and AcceptInvitationDto in apps/api/src/modules/invitations/dto/
- [x] T044 [P] [US4] Create InvitationsModule + InvitationsController in apps/api/src/modules/invitations/
- [x] T045 [US4] Implement InvitationsService.create in apps/api/src/modules/invitations/invitations.service.ts (PLATFORM_OWNER any org; token hashed, single-use, TTL; 409 on pending duplicate)
- [x] T046 [US4] Implement InvitationsService.accept in apps/api/src/modules/invitations/invitations.service.ts (validate token, create User with role + org, INVITED→ACTIVE, issue session; uniform INVALID_OR_EXPIRED_TOKEN)
- [x] T047 [US4] Register InvitationsModule in apps/api/src/app.module.ts
- [x] T048 [US4] Enforce INVITED login blocking in AuthService.login in apps/api/src/modules/auth/auth.service.ts (FR-006, uniform 401)

**Checkpoint**: Invitation lifecycle works end-to-end for PLATFORM_OWNER

---

## Phase 8: User Story 8 - Cross-tenant access forbidden (Priority: P2)

**Goal**: organizationId never trusted from client; tenant boundary enforced from JWT; PLATFORM_OWNER bypasses tenant filters.

**Independent Test**: org1 user requests org2 resource → 403; PLATFORM_OWNER requests any org resource → 200.

### Tests for User Story 8 ⚠️

- [x] T049 [P] [US8] Unit tests for tenant scope helper (org user filtered, PLATFORM_OWNER bypass) in apps/api/src/core/guards/roles.guard.spec.ts
- [x] T050 [P] [US8] Integration test cross-tenant 403 + PLATFORM_OWNER bypass in apps/api/test/tenant-isolation.e2e-spec.ts

### Implementation for User Story 8

- [x] T051 [US8] Implement tenant-scope enforcement (organizationId derived from JWT only; client-provided organizationId ignored — FR-013/NR-009/NR-010) in apps/api/src/core/guards/tenant-scope.guard.ts and apply to tenant-scoped modules
- [x] T052 [US8] Apply JwtAuthGuard + tenant enforcement to an existing tenant module (e.g., organizations) in apps/api/src/modules/organizations/

**Checkpoint**: Tenant isolation verified across modules

---

## Phase 9: User Story 5 - Invitation by ADMINISTRADOR (Priority: P3)

**Goal**: ADMINISTRADOR invites users only within their own organization.

**Independent Test**: ADMINISTRADOR invites into own org → 201; into another org → 403.

### Tests for User Story 5 ⚠️

- [x] T053 [P] [US5] Unit tests ADMINISTRADOR org-bound invitation in apps/api/src/modules/invitations/invitations.service.spec.ts

### Implementation for User Story 5

- [x] T054 [US5] Enforce ADMINISTRADOR own-organization constraint in InvitationsService.create (FR-010) in apps/api/src/modules/invitations/invitations.service.ts
- [x] T055 [US5] Integration test ADMINISTRADOR invitation (own org 201, foreign org 403) in apps/api/test/invitations.e2e-spec.ts

**Checkpoint**: ADMINISTRADOR invitation privilege verified

---

## Phase 10: User Story 6 - GERENTE/OPERADOR cannot invite (Priority: P3)

**Goal**: GERENTE and OPERADOR cannot create invitations.

**Independent Test**: GERENTE/OPERADOR attempt invitation → 403 FORBIDDEN.

### Tests for User Story 6 ⚠️

- [x] T056 [P] [US6] Unit tests GERENTE/OPERADOR invitation rejection in apps/api/src/modules/invitations/invitations.service.spec.ts

### Implementation for User Story 6

- [x] T057 [US6] Enforce GERENTE/OPERADOR rejection (403 FORBIDDEN) via RolesGuard on invitations controller in apps/api/src/modules/invitations/invitations.controller.ts (FR-011)
- [x] T058 [US6] Integration test GERENTE/OPERADOR 403 in apps/api/test/invitations.e2e-spec.ts

**Checkpoint**: All user stories independently functional

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T059 [P] Implement GET /api/v1/auth/me (JWT context endpoint) in apps/api/src/modules/auth/auth.controller.ts per contracts/identity-api.md
- [x] T060 Run quickstart.md validation scenarios S1-S12 in apps/api (per quickstart.md)
- [x] T061 [P] Coverage review: unit + integration >80% (Constitution X) via `npm run test:cov` in apps/api
- [x] T062 [P] Security hardening: cookie flags verification, no credentials in logs, env secrets only (Constitution IX) in apps/api/src
- [x] T063 Run lint, build, and typecheck gates (`npm run lint`, `npm run build`) in apps/api
- [x] T064 Update specs/api OpenAPI contract for new identity endpoints (POST /auth/refresh, /auth/logout, /auth/me, /auth/password-reset/*, /invitations, /invitations/accept) in specs/api/paths/ (API_CONTRACT_FIRST — Constitution III)
- [x] T065 [P] Implement identity audit logging (Constitution IX; AD-001/AD-002): create audit service in apps/api/src/modules/auth/audit.identity.service.ts reusing schema.prisma:298 model Audit; record successful+failed login, session creation/refresh/reuse-detection/revocation/logout, invitation creation+acceptance, password-reset request+successful change; organizationId from authenticated actor's trusted context only (null for PLATFORM_OWNER and pre-auth/unknown-email events; NEVER from client input; tenant-scoped queries treat null as platform scope); never persist passwords, raw JWTs, refresh/invitation/reset tokens, or secrets; minimal context (actor/user when available, action, outcome, timestamp, non-sensitive context); integrate into auth flows without changing error semantics or auth behavior; add unit tests + integration coverage; verify audit failures never expose credentials or alter authentication error responses
- [x] T066 Remove deprecated JWT_EXPIRES_IN (replaced by ACCESS_TOKEN_TTL per research.md R-006) from env.validation.ts and configuration.ts in apps/api/src/core/config/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories; T006 migration runs after T005 gate (APPROVED 2026-08-13)
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - no dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 (reuses AuthService.login) but adds only org-claim resolution; independently testable once US1 exists
- **User Story 7 (P1)**: Depends on US1 (session creation on login) - refresh/logout/revocation
- **User Story 3 (P2)**: Depends on Foundational (UserSessionsService/UsersService) - independent of US1/US2
- **User Story 4 (P2)**: Depends on Foundational + US2 role resolution (roleId validation)
- **User Story 8 (P2)**: Depends on US1 (JWT auth) - tenant enforcement
- **User Story 5 (P3)**: Depends on US4 (same module) - adds ADMINISTRADOR constraint
- **User Story 6 (P3)**: Depends on US4 - adds role rejection

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Services before controllers
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational completes: US1, US3, US8 can start in parallel (US2/US7 wait on US1; US4 waits on US2)
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test AuthService.login in apps/api/src/modules/auth/auth.service.spec.ts"
Task: "Integration test login in apps/api/test/auth.e2e-spec.ts"

# Launch all setup tasks for User Story 1 together:
Task: "Create LoginDto in apps/api/src/modules/auth/dto/login.dto.ts"
Task: "Create AuthModule in apps/api/src/modules/auth/auth.module.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories; T005 human gate)
3. Complete Phase 3: User Story 1 (PLATFORM_OWNER login)
4. **STOP and VALIDATE**: Test User Story 1 independently (T016, T017)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (org login) → Test → Deploy/Demo
4. Add User Story 7 (session lifecycle) → Test → Deploy/Demo
5. Add User Story 3 (password reset) → Test → Deploy/Demo
6. Add User Story 4 (invitations) → Test → Deploy/Demo
7. Add User Story 8 (tenant isolation) → Test → Deploy/Demo
8. Add User Stories 5-6 (invitation privileges) → Test → Deploy/Demo

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 → then US2 → then US7 (login chain)
   - Developer B: User Story 3 (password reset)
   - Developer C: User Story 8 (tenant isolation)
3. After US1+US2: Developer A or C picks US4 (invitations) → US5 → US6

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- T005/T006 gate APPROVED 2026-08-13 (all four decisions + migration strategy); still inspect existing data and review generated migration SQL before executing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence