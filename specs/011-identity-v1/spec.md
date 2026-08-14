# Feature Specification: Identity v1

**Feature**: Identity v1 — Authentication and authorization foundation  
**Short name**: `identity-v1`  
**Created**: 2026-08-13  
**Status**: Draft  
**Input**: User description: "Create the Identity v1 specification now."

## User Scenarios & Testing *(mandatory)*

**Clarifications Session: 2026-08-13**

- Q1: Password-reset behavior for INVITED, SUSPENDED, deleted, and unknown email users? → A1: INVITED users may request password reset only after status changes to ACTIVE (via invitation acceptance); SUSPENDED/deleted users cannot reset; unknown emails produce generic "If an account exists with that email, a password reset link has been sent" response to avoid account enumeration, preventing account existence leakage.

- Q2: Invitation lifecycle - when User record created and INVITED→ACTIVE transition? → A2: User record created during invitation acceptance (not initiation); status changes from INVITED to ACTIVE immediately after token validation, before password setup; password setup completes ACTIVE state transition.

- Q3: Password-reset behavior for ACTIVE, INVITED, SUSPENDED, deleted, and unknown email users? → A3: ACTIVE users follow the standard flow (request token → receive email → set new password); INVITED users are blocked before acceptance and follow the standard flow after acceptance; SUSPENDED users are blocked with error "Account is suspended; contact administrator to restore access"; deleted users are blocked with error "Account is deleted; cannot perform password reset"; unknown emails always receive the generic "If an account exists with that email, a password reset link has been sent" response to prevent account enumeration.

- Q4: Authentication failure behavior without exposing account existence? → A4: Uniform 401 response with generic message "Invalid credentials" for both unknown email and wrong password; the system never distinguishes between "account not found" and "wrong password"; special user states (INVITED, SUSPENDED, deleted) are handled through their specific flows (invitation acceptance, session renewal blocking), not through differentiated login responses.

- Q5: Expired, revoked, and reused invitation/reset tokens behavior? → A5: All invalid-token presentations (expired, revoked, reused, malformed) return a uniform generic error (400 "Invalid or expired token") with no distinction between token states; detailed token-state is logged internally for observability without exposing lifecycle details to the client.

---

### User Story 1 - P1: Platform owner login
**Description**: Platform owner logs in to access global platform functionality across all organizations.

**Why this priority**: P1 — Highest; platform owner is the primary global actor and must be able to operate across organizations without tenant restrictions.

**Independent Test**: Login with PLATFORM_OWNER credentials; verify JWT contains `organizationId=null`, `role=PLATFORM_OWNER`, `accountType=PLATFORM`; verify access token and HttpOnly refresh cookie issued.

**Acceptance Scenarios**:
1. **Given** a PLATFORM_OWNER user exists, **When** they login with valid credentials, **Then** JWT access token is issued with claims `sub`, `userId`, `accountType=PLATFORM`, `organizationId=null`, `role=PLATFORM_OWNER`, **And** refresh token is delivered via HttpOnly cookie.
2. **Given** a PLATFORM_OWNER user exists, **When** they attempt cross-tenant resource access, **Then** access is permitted since `organizationId=null` allows operation across all organizations.

### User Story 2 - P1: Organization user login
**Description**: Organization user (ADMINISTRADOR/GERENTE/OPERADOR) logs in to access organization-scoped functionality.

**Why this priority**: P1 — Highest; all business operations rely on organization users being able to authenticate and access their organization's resources.

**Independent Test**: Login with ADMINISTRADOR credentials; verify JWT contains `organizationId=<org-id>`, `role=ADMINISTRADOR`, `accountType=ORGANIZATION`; verify access token and refresh cookie issued.

**Acceptance Scenarios**:
1. **Given** an ADMINISTRADOR user belongs to organization X, **When** they login, **Then** JWT `organizationId` equals organization X's ID; access to organization X's resources is permitted; access to other organizations' resources is forbidden.
2. **Given** a GERENTE user, **When** they login, **Then** JWT `role=GERENTE`, `accountType=ORGANIZATION`, and `organizationId` is their organization; organization isolation enforced.
3. **Given** an OPERADOR user, **When** they login, **Then** JWT `role=OPERADOR`, `accountType=ORGANIZATION`, and `organizationId` is their organization.

### User Story 3 - P2: Password reset
**Description**: User initiates password reset via time-limited reset token.

**Why this priority**: P2 — Important for user recovery; must be secure and time-limited.

**Independent Test**: User requests password reset → receives reset token via email → uses token to set new password → old token invalidated; attempt to use token again fails.

**Acceptance Scenarios**:
1. **Given** a registered user, **When** they request password reset with valid email, **Then** time-limited reset token is generated and delivered via secure channel; token valid for fixed window.
2. **Given** a reset token is presented, **When** user sets new password, **Then** token is invalidated; user can login with new credentials.
3. **Given** an INVITED user, **When** they request password reset before acceptance, **Then** reset is blocked until invitation is accepted and status transitions to ACTIVE.

**Password Reset Rules by User State** (clarification integrated):
- **ACTIVE users**: May request password reset; time-limited token delivered via secure channel; token single-use; invalidated after successful password change.
- **INVITED users**: May request password reset **only after** status changes to ACTIVE (via invitation acceptance); before acceptance, the request returns the generic response (no token issued); the invitation email directs the user to accept the invitation first.
- **SUSPENDED users**: Cannot request password reset; attempt blocked with message to contact administrator.
- **Deleted accounts** (deletedAt set): Cannot request password reset; account inaccessible.
- **Unknown emails** (email not associated with any account): Generic response "If an account exists with that email, a password reset link has been sent" — never reveals whether an account exists, preventing account enumeration.

### User Story 4 - P2: User invitation by PLATFORM_OWNER
**Description**: PLATFORM_OWNER invites a new user to any organization.

**Why this priority**: P2 — Important for platform onboarding; PLATFORM_OWNER has global invitation privileges.

**Independent Test**: PLATFORM_OWNER sends invitation to email → INVITED user accepts (User record created during acceptance with INVITED status) → status transitions to ACTIVE immediately after token validation → user sets password → ACTIVE state fully confirmed.

**Acceptance Scenarios**:
1. **Given** a PLATFORM_OWNER, **When** they invite a user to any organization, **Then** invitation token is single-use, time-limited; INVITED user cannot login before acceptance.
2. **Given** an invitation token is presented, **When** INVITED user accepts and sets password, **Then** user account created with ACTIVE status; JWT issued with appropriate claims.

**Invitation Lifecycle Clarification** (integrated):
- User record created during invitation acceptance (not initiation); status changes from INVITED to ACTIVE immediately after token validation, before password setup; password setup completes the ACTIVE state transition.

### User Story 5 - P3: User invitation by ADMINISTRADOR
**Description**: Organization administrator invites users within their own organization.

**Why this priority**: P3 — Useful for org-level onboarding; constrained to organization boundary.

**Independent Test**: ADMINISTRADOR invites user to their organization → invitation token organization-bound → acceptance creates user within same organization.

**Acceptance Scenarios**:
1. **Given** an ADMINISTRADOR of organization X, **When** they invite a user to organization X, **Then** invitation is accepted; user created within organization X.
2. **Given** an ADMINISTRADOR of organization X, **When** they attempt to invite a user to organization Y (Y ≠ X), **Then** invitation is rejected; ADMINISTRADOR can only invite within their own organization.

### User Story 6 - P3: GERENTE/OPERADOR cannot invite
**Description**: GERENTE and OPERADOR users cannot invite new users.

**Why this priority**: P3 — Defines role boundaries; prevents unauthorized invitation attempts.

**Independent Test**: GERENTE or OPERADOR attempts to invite user → request rejected with appropriate error.

**Acceptance Scenarios**:
1. **Given** a GERENTE user, **When** they attempt to invite a new user, **Then** request rejected; only PLATFORM_OWNER and ADMINISTRADOR may invite.
2. **Given** an OPERADOR user, **When** they attempt to invite a new user, **Then** request rejected; same restriction as GERENTE.

### User Story 7 - P1: Session revocation via UserSession
**Description**: Active session can be revoked through UserSession concept.

**Why this priority**: P1 — Critical for security; suspended or terminated users must be unable to maintain access.

**Independent Test**: UserSession deleted/invalidated → associated refresh token hash invalidated → subsequent refresh attempts fail; user forced to re-authenticate via login.

**Acceptance Scenarios**:
1. **Given** an active user session, **When** UserSession is revoked, **Then** refresh token hash invalidated; attempt to refresh access token fails with 401.
2. **Given** a SUSPENDED user, **When** they attempt session renewal, **Then** renewal rejected; user must contact administrator.
3. **Given** a user with deletedAt set, **When** they attempt session renewal, **Then** renewal rejected; account marked as deleted.

### User Story 8 - P2: Cross-tenant access forbidden
**Description**: Organization users cannot access resources outside their organization; organizationId from JWT is the authoritative source.

**Why this priority**: P2 — Critical for multi-tenant isolation; data leakage across organizations must be prevented; scheduled after core auth flows (US1/US2) since it builds on the JWT guard foundation.

**Independent Test**: Organization user attempts resource access in another organization → forbidden (403); organizationId from JWT mismatches resource organizationId.

**Acceptance Scenarios**:
1. **Given** a user from organization X, **When** they attempt to access a resource in organization Y, **Then** access forbidden (403); organizationId from JWT enforced as authorization source.
2. **Given** a client-provided organizationId different from JWT organizationId, **When** they attempt access, **Then** access forbidden; client-provided organizationId never trusted.

## Requirements

### Functional Requirements

- **FR-001**: System MUST issue JWT access token upon successful authentication containing claims: `sub`, `userId`, `accountType`, `organizationId`, `role`.
- **FR-002**: System MUST issue refresh token via HttpOnly cookie upon login; refresh token persisted only as hash through UserSession model.
- **FR-003**: PLATFORM_OWNER JWT: `accountType=PLATFORM`, `organizationId=null`, `role=PLATFORM_OWNER`.
- **FR-004**: Organization user JWT: `accountType=ORGANIZATION`, `organizationId=required`, `role∈{ADMINISTRADOR,GERENTE,OPERADOR}`.
- **FR-005**: Access tokens MUST be short-lived; refresh tokens MUST be long-lived.
- **FR-006**: INVITED status prevents login; user cannot authenticate until invitation accepted and status transitions to ACTIVE.
- **FR-007**: Users with status SUSPENDED or deletedAt set cannot renew sessions; session renewal rejected.
- **FR-008**: Invitation tokens are single-use and time-limited; expired or used tokens invalidated.
- **FR-009**: PLATFORM_OWNER may invite users to any organization without organization restriction.
- **FR-010**: ADMINISTRADOR may invite users only within their own organization; cross-organization invitation rejected.
- **FR-011**: GERENTE and OPERADOR cannot invite users; invitation request rejected with appropriate error.
- **FR-012**: Password reset generates time-limited token; token single-use; invalidated after successful password change.
- **FR-013**: Cross-tenant access forbidden; organizationId never trusted from client; derived from authenticated identity JWT.
- **FR-014**: UserSession concept enables session revocation; revocation invalidates associated refresh token hash.

### Non-Functional / Security Requirements

- **NR-001**: Access tokens MUST be cryptographically signed with a platform secret; the concrete signing algorithm is an implementation-plan decision.
- **NR-002**: Access token lifetime: short duration (industry standard for web sessions); concrete duration defined in implementation plan.
- **NR-003**: Refresh token lifetime: long duration enabling re-authentication without re-login; concrete duration defined in implementation plan.
- **NR-004**: Refresh tokens MUST NOT be stored in plaintext at any layer; they are persisted only as hashes via the UserSession concept. Concrete hashing mechanism is an implementation-plan decision.
- **NR-005**: Session revocation via UserSession invalidates associated refresh token hash; subsequent refresh attempts fail.
- **NR-006**: SUSPENDED and deletedAt users blocked from session renewal; authentication endpoint rejects renewal attempts.
- **NR-007**: Invitation tokens expire after fixed time window; single-use only; second acceptance attempt rejected.
- **NR-008**: All API requests (except public endpoints) require valid JWT authentication; missing/invalid token returns 401.
- **NR-009**: organizationId never trusted from client; always derived from authenticated identity JWT; client-provided organizationId ignored for authorization.
- **NR-010**: Cross-tenant access forbidden at authorization layer; enforced via JWT organizationId comparison against resource organizationId.
- **NR-011**: Refresh-token rotation is required: each renewal issues a new refresh token and invalidates the previous one. UserSession persistence/storage mechanics are implementation-plan decisions, not business requirements.

## Authentication Behavior

- **Login**: Authenticated user receives access token (JWT, short-lived) and refresh token (HttpOnly cookie, long-lived). PLATFORM_OWNER and organization users receive appropriate JWT claims based on their `accountType` and `role`. Access token contains `sub`, `userId`, `accountType`, `organizationId`, `role`. Refresh token delivered exclusively via HttpOnly cookie; never sent in request body or returned in API response.
  - **Authentication failure**: Both unknown email and wrong password return a uniform 401 response with generic message "Invalid credentials" — the system never distinguishes between "account not found" and "wrong password" to prevent account enumeration via the login endpoint. Special user states (INVITED, SUSPENDED, deleted) are handled through their specific flows (invitation acceptance, session renewal blocking), not through differentiated login responses.

- **Password Reset**: User (or public endpoint) accepts username/email → system generates time-limited reset token → reset token delivered via secure channel (e.g., email) → user presents reset token with new password → system validates token and updates credentials → reset token invalidated.
  - **ACTIVE users**: Standard flow — request token, receive email, set new password.
  - **INVITED users**: Cannot initiate password reset before accepting invitation and status transitions to ACTIVE. After acceptance, standard password reset flow applies.
  - **SUSPENDED users**: Password reset requests blocked; returns error "Account is suspended; contact administrator to restore access."
  - **Deleted accounts** (deletedAt set): Password reset requests blocked; returns error "Account is deleted; cannot perform password reset."
  - **Unknown emails**: System returns generic message "If an account exists with that email, a password reset link has been sent" — never reveals whether an account exists, preventing account enumeration. Reset token never issued for unknown emails.

- **User Invitation**: PLATFORM_OWNER or ADMINISTRADOR sends invitation (email with single-use, time-limited token) to prospective user. Token validates one acceptance only. INVITED user cannot log in until invitation accepted and password set. Upon acceptance, the User record is created during acceptance, status changes from INVITED to ACTIVE immediately after token validation, and appropriate JWT claims are issued based on user role and organization. GERENTE and OPERADOR cannot initiate invitations; request rejected.

## Authorization Boundaries

- **PLATFORM_OWNER**: Global platform role, not affiliated with any organization. JWT `organizationId=null`. May operate across all organizations without tenant restriction. May invite users to any organization. All authorization decisions for PLATFORM_OWNER bypass organization-level checks due to `organizationId=null`.

- **Organization Users** (ADMINISTRADOR, GERENTE, OPERADOR): Bound to exactly one organization via JWT `organizationId`. Cannot access resources outside their organization. Authorization enforced by comparing JWT `organizationId` against resource `organizationId`. Cross-tenant data access forbidden.

- **Role-Based Access**: RBAC enforced at authorization layer. PLATFORM_OWNER > ADMINISTRADOR > GERENTE > OPERADOR in terms of invitation privileges, but organization isolation rules apply equally to all organization users regardless of role.

- **Cross-Tenant Forbidden**: No query or endpoint may use client-provided `organizationId` for authorization. Organization context must come from authenticated identity JWT. If JWT `organizationId` does not match resource `organizationId`, access denied (403).

## Session Lifecycle

1. **Creation**: Successful login creates `AccessToken` (short-lived JWT) + `RefreshToken` (HttpOnly cookie, long-lived) + `UserSession` record. UserSession stores refresh token hash, user status, creation timestamp.

2. **Renewal**: Client uses refresh token (via authenticated endpoint) to obtain new access token. Server validates refresh token hash against UserSession; if match and user status is ACTIVE (not SUSPENDED, deletedAt null), new access token issued. Old refresh token hash invalidated; new refresh token hash generated (rotation).

3. **Revocation**: UserSession deleted or invalidated → associated refresh token hash invalidated → subsequent refresh attempts fail with 401 → user must re-authenticate via login to obtain new session.

4. **Suspension**: User status → SUSPENDED → all session renewal attempts rejected; active sessions eventually invalidated. User with deletedAt set → same restriction; account considered deleted.

5. **Expiration**: Access token expires after short lifetime → client uses refresh token to obtain new access token. If refresh token expired (beyond long lifetime) or invalidated, user must re-authenticate via login.

## Invitation Lifecycle

1. **Initiation**: PLATFORM_OWNER or ADMINISTRADOR sends invitation email with single-use, time-limited token to prospective user. Token includes inviting user's organization context (for ADMINISTRADOR) or no organization restriction (for PLATFORM_OWNER).

2. **Token Characteristics**: Invitation token is single-use only — first acceptance validates and consumes token; subsequent presentations rejected. Token time-limited — expires after fixed window from generation. Token organization-bound for ADMINISTRADOR invitations (organization must match inviter's organization); no organization restriction for PLATFORM_OWNER invitations.
   - **Invalid-token presentations** (expired, revoked, reused, malformed): uniform generic error "Invalid or expired token" (400); no distinction between token states is revealed to the client; detailed token-state logged internally for observability.

3. **Acceptance**: INVITED user presents token and sets new credentials → system validates token → **User record created** (if not already existing during acceptance) → status changes from INVITED to ACTIVE immediately after token validation → appropriate JWT claims issued (accountType=ORGANIZATION, role based on invitation type, organizationId from token context).

4. **Post-Acceptance**: User can now log in with credentials. Receives appropriate JWT. Used token destroyed. Second acceptance attempt rejected with error.

5. **Invalidation**: If invitation token expires before acceptance, it becomes invalid. If ADMINISTRATOR attempts to invite user to different organization, invitation rejected at initiation.

**Password setup** after acceptance: User sets new password → system updates credentials → ACTIVE state fully confirmed; user can now authenticate via login.

## Password Reset Lifecycle

1. **Request**: User (or public endpoint) requests password reset with username/email → system generates time-limited reset token → token stored associated with user account → reset token delivered to user's email (secure channel).
   - **ACTIVE users**: Standard flow — token generated and delivered.
   - **INVITED users**: Request blocked before acceptance; after acceptance, standard flow applies.
   - **SUSPENDED users**: Request blocked; returns error "Account is suspended; contact administrator to restore access."
   - **Deleted accounts**: Request blocked; returns error "Account is deleted; cannot perform password reset."
   - **Unknown emails**: Generic response only ("If an account exists with that email, a password reset link has been sent"); no token issued.

2. **Validation**: Upon presenting reset token with new password request → system validates token is not expired, not already used, and associated with active user account.

3. **Completion**: User sets new password → system updates credentials → reset token invalidated → user can now log in with new password. Previous password invalidated.

4. **Expiry**: Reset token expires after fixed time window (independent of access/refresh token lifetimes). Expired reset token rejected; user must request new reset.
   - **Invalid-token presentations** (expired, revoked, reused, malformed): uniform generic error "Invalid or expired token" (400); no distinction between token states is revealed to the client; detailed token-state logged internally for observability.

5. **Blocked for INVITED**: INVITED users cannot complete password reset until invitation accepted and status transitions to ACTIVE. Attempted reset before acceptance returns the generic response (no token issued); the invitation email directs the user to accept the invitation first.

## Acceptance Scenarios

| Scenario | Precondition | Action | Expected Outcome |
|----------|-------------|--------|------------------|
| AS-001 | User has valid credentials | Login with username/password | JWT access token + refresh cookie issued; `sub`, `userId`, `accountType`, `organizationId`, `role` claims present in JWT |
| AS-002 | PLATFORM_OWNER credentials | Login as PLATFORM_OWNER | JWT with `organizationId=null`, `role=PLATFORM_OWNER`, `accountType=PLATFORM`; refresh cookie issued; cross-tenant access allowed |
| AS-003 | Organization user credentials | Login as ADMINISTRADOR | JWT with `organizationId=<org-id>`, `role=ADMINISTRADOR`, `accountType=ORGANIZATION`; refresh cookie issued; org isolation enforced |
| AS-004 | INVITED user | Attempt login before acceptance | Uniform 401 INVALID_CREDENTIALS; INVITED status blocks authentication; the invitation email directs the user to accept the invitation |
| AS-005 | SUSPENDED user | Attempt session renewal | Renewal rejected with error; user must contact administrator to restore access |
| AS-006 | GERENTE user | Attempt to invite user | Request rejected; only PLATFORM_OWNER and ADMINISTRADOR may invite; error message shown |
| AS-007 | Valid refresh token exchanged | Use refresh token to get new access token | New access token issued; old refresh token hash invalidated; new refresh token hash generated (rotation) |
| AS-008 | Cross-tenant access attempt | Access resource in another organization | Forbidden (403); `organizationId` from JWT mismatches resource `organizationId`; access denied |
| AS-009 | ADMINISTRATIVE invites user to different org | Invitation initiated | Invitation rejected; ADMINISTRADOR can only invite within their own organization |
| AS-010 | Used invitation token presented again | Second acceptance attempt | Rejected; invitation token is single-use only |
| AS-011 | Unknown email or wrong password | Attempt login | Uniform 401 response with generic message "Invalid credentials"; system does not reveal whether the account exists |

## Success Criteria *(mandatory)*

- **SC-001**: Login for PLATFORM_OWNER and organization users issues a JWT with all five claims (`sub`, `userId`, `accountType`, `organizationId`, `role`) plus an HttpOnly refresh cookie.
- **SC-002**: Refresh issues a new access token and rotates the refresh token for ACTIVE users; returns 401 for SUSPENDED/deletedAt users.
- **SC-003**: Anti-enumeration holds: unknown email and wrong password both return uniform 401 INVALID_CREDENTIALS; password-reset request for unknown email returns the generic 200 message.
- **SC-004**: Cross-tenant access returns 403; client-provided organizationId never influences authorization.
- **SC-005**: Invitation is single-use and time-limited; User record created at acceptance; INVITED→ACTIVE immediately after token validation; second acceptance rejected with 400 INVALID_OR_EXPIRED_TOKEN.
- **SC-006**: Password reset is single-use and time-limited; SUSPENDED/deleted blocked with 403; INVITED blocked until ACTIVE; previous password invalidated on change.
- **SC-007**: Session revocation invalidates the refresh-token hash; subsequent refresh fails with 401.
- **SC-008**: Identity modules reach ≥ 80% coverage; all scenarios AS-001..AS-011 pass.

## Explicit Out-of-Scope Items

- ❌ Password recovery via email without token mechanism (reset flow covered, but alternative paths out of scope)
- ❌ Social login (OAuth2, Google, Apple, etc.) — out of v1 scope
- ❌ Multi-factor authentication — out of v1 scope
- ❌ Device remember/mechanism beyond refresh token HttpOnly cookie — out of scope (must use HttpOnly cookie only)
- ❌ Organization creation/deletion — handled by separate module (Organizations feature)
- ❌ Role creation/management beyond fixed v1 roles (PLATFORM_OWNER, ADMINISTRADOR, GERENTE, OPERADOR) — fixed v1 roles
- ❌ Refresh token storage in localStorage or client-side memory — out of scope (must use HttpOnly cookie)
- ❌ Password strength validation specifics — covered by DTO validation in API layer, but exact rules out of spec scope
- ❌ OAuth2, OpenID Connect integration — out of v1 scope (JWT Bearer only)
- ❌ Token introspection endpoint — out of v1 scope
- ❌ Session revocation via API endpoint other than UserSession concept — out of scope

## Known Conflicts / Decisions Pending

| Conflict | Source | Resolution |
|----------|--------|------------|
| Role naming: Constitution §V lists "Owner, Administrator, Operator, Viewer" as initial RBAC roles while approved Identity decisions use "PLATFORM_OWNER, ADMINISTRADOR, GERENTE, OPERADOR" | Constitution §V (multi-tenancy) vs. approved Identity architectural decisions | v1 adopts ADMINISTRADOR, GERENTE, OPERADOR, PLATFORM_OWNER as the authoritative role set. "Viewer" and legacy OWNER/ADMIN/MANAGER/AGENT roles not introduced in v1. Constitution note at §V acknowledges this deferral. **HUMAN GATE approved 2026-08-13**: ASESOR→OPERADOR migration rule confirmed (relationships and Role IDs preserved, no silent deletion); PLATFORM_OWNER not tenant-bound (`organizationId = NULL`, no reserved organization). |
| Token lifetime defaults: Constitution §VI & §VII reference "15min access, 7day refresh, 48h invitation" as deferred principles; concrete defaults moved to implementation specifications | Constitution §VI (JWT AND SESSION SECURITY) & §VII (IDENTITY FLOWS) | Token lifetimes defined in implementation specifications, not in constitution. Spec records industry-standard expectations without concrete values; exact durations determined at implementation. |
| UserSession implementation: Approved architectural decision; full implementation pending including Prisma model | Constitution §VI (JWT AND SESSION SECURITY) | UserSession concept defined in spec with refresh token hash persistence model. Concrete Prisma model and persistence mechanism deferred to implementation. Constitution note at §VI acknowledges pending implementation. |
| API Guidelines §17 lists RBAC roles as "Owner, Administrator, Operator, Viewer" while this spec uses "PLATFORM_OWNER, ADMINISTRADOR, GERENTE, OPERADOR" | API Guidelines §17 (Authorization) vs. approved Identity decisions | v1 uses the Identity-approved role set. API Guidelines updated in future versions to match. Constitution §V already reconciles this by listing the approved v1 roles. |

---
