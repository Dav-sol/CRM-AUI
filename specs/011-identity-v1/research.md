# Research: Identity v1

Phase 0 output for `specs/011-identity-v1`. Resolves the technical unknowns from the plan's Technical Context. Format per decision: Decision / Rationale / Alternatives considered.

## R-001: JWT signing library

- **Decision**: Add `@nestjs/jwt` (official NestJS wrapper over `jsonwebtoken`), used together with the existing `passport` + `passport-jwt` dependencies already present in `apps/api/package.json`.
- **Rationale**: The repo already depends on `passport` and `passport-jwt` (package.json lines 37-38); `@nestjs/jwt` provides typed sign/verify helpers, `JwtModule.registerAsync`, and integrates with the existing NestJS DI container. It is the canonical pairing for passport-jwt in NestJS apps.
- **Alternatives considered**: raw `jsonwebtoken` (works but loses DI integration and adds manual secret/clock handling); `jose` (more modern but new API surface and no passport integration in the codebase). No JWT package currently installed, so this is an additive, justified dependency change (Constitution XI: documented).

## R-002: Refresh token hashing

- **Decision**: Hash refresh tokens with SHA-256 (Node built-in `crypto`) before persistence; compare hashes with a timing-safe comparison.
- **Rationale**: Refresh tokens are high-entropy random strings (>= 32 bytes); a keyed hash is unnecessary and SHA-256 is the industry-standard one-way hash for opaque token storage. Timing-safe comparison avoids timing side channels. Spec NR-004 requires hashed persistence; the concrete mechanism is an implementation-plan decision (NR-011), resolved here.
- **Alternatives considered**: bcrypt for refresh tokens (unnecessary CPU cost per refresh, tokens are already random); HMAC with server secret (no added value over SHA-256 for opaque random tokens).

## R-003: Token lifetimes

- **Decision**:
  - Access token: 15 minutes
  - Refresh token: 7 days
  - Invitation token: 48 hours, single-use
  - Password reset token: 1 hour, single-use
- **Rationale**: The spec's Known Conflicts section records the Constitution's previously-referenced defaults (15min access / 7day refresh / 48h invitation) which were deferred to implementation specs. These match the finalized spec's requirement of short-lived access and long-lived refresh tokens, and are configurable via env vars (see R-006).
- **Alternatives considered**: longer access lifetime (30-60 min) reduces refresh frequency but increases exposure window of stolen access tokens; shorter refresh (24h) forces more frequent re-login, harming UX. Selected values are the industry-standard balanced defaults.

## R-004: Refresh token rotation and reuse policy

- **Decision**: Rotate the refresh token on every successful refresh: issue a new refresh token and invalidate the previous one (new hash replaces the old hash in the UserSession row). A reused (already-rotated) token fails with the uniform "Invalid or expired token" error and revokes the whole session.
- **Rationale**: Rotation contains token leakage damage and matches spec Q5/A5 (uniform generic error, no distinction between expired/revoked/reused; internal logging for observability). Revoking the entire session on reuse detection is the standard anti-replay measure.
- **Alternatives considered**: static refresh token with fixed expiry (simpler, but reuse cannot be detected and theft is undetectable); no session revocation on reuse (weaker security posture than the spec's session security intent).

## R-005: UserSession persistence and fields

- **Decision**: Persist sessions in a new `UserSession` model (see `data-model.md`): `id`, `uuid`, `userId`, `refreshTokenHash`, `userAgent`, `ip`, `expiresAt`, `revokedAt`, `lastUsedAt`, `createdAt`, `updatedAt`. One row per issued (and currently valid) refresh token.
- **Rationale**: Spec FR-014 and NR-004/005 require a revocable session model storing only token hashes. `revokedAt` supports revocation without destructive deletes; `expiresAt` supports long-lived refresh with hard expiry.
- **Alternatives considered**: storing sessions in Redis (repository has Redis/BullMQ for queues, but session revocation must survive cache eviction and Redis is not the source of truth in this codebase); JSONB column on User (violates one-row-per-session semantics and makes revocation/querying awkward).

## R-006: Environment configuration

- **Decision**: Extend `apps/api/src/core/config/env.validation.ts` (joi) and `configuration.ts` with:
  - `JWT_REFRESH_SECRET` (required, min 32 chars) — separate secret for refresh tokens
  - `ACCESS_TOKEN_TTL` (default `15m`)
  - `REFRESH_TOKEN_TTL` (default `7d`)
  - `INVITATION_TOKEN_TTL` (default `48h`)
  - `PASSWORD_RESET_TOKEN_TTL` (default `1h`)
  - `REFRESH_COOKIE_NAME` (default `refresh_token`)
  - `COOKIE_SECURE` (default true in production)
- **Rationale**: Constitution IX requires secrets only via env; separating the refresh secret from the access-token secret (`JWT_SECRET` already exists) limits blast radius. TTLs as env vars keep the concrete lifetimes (R-003) configurable without code changes. `JWT_EXPIRES_IN` (existing, default `1d`) is deprecated in favor of `ACCESS_TOKEN_TTL`; keeping both would be ambiguous — the plan replaces its use for access tokens.
- **Alternatives considered**: single `JWT_SECRET` for both token types (simpler but any JWT leak compromises refresh validity; separation is standard).

## R-007: Cookie delivery settings

- **Decision**: Refresh token delivered in a cookie with flags: `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/api/v1/auth` (narrow path), no `expires` at cookie level (server-side `expiresAt` governs validity; cookie cleared on logout/revocation).
- **Rationale**: Spec FR-002/NR requirement: refresh tokens delivered only via HttpOnly cookies, never in the response body. `SameSite=Lax` mitigates CSRF while keeping the cookie usable for same-site API calls; the narrow path avoids sending the cookie to non-auth endpoints.
- **Alternatives considered**: `SameSite=Strict` (breaks refresh from top-level navigation contexts); returning the refresh token in the JSON body (explicitly out of scope in the spec); localStorage (forbidden by spec).

## R-008: Password hashing

- **Decision**: bcrypt (already a dependency, `bcrypt@6`) with cost factor 12.
- **Rationale**: bcrypt is already in `apps/api/package.json` (line 29); cost 12 balances CPU cost against brute-force resistance for interactive login. `User.passwordHash` already exists in the schema.
- **Alternatives considered**: argon2id (stronger, but new dependency and the codebase already standardized on bcrypt); scrypt (Node built-in, but no existing usage in repo).

## R-009: Anti-enumeration error mapping (login and password reset)

- **Decision**: Map failures to the uniform responses defined by the spec clarifications:
  - Login (unknown email or wrong password): `401` with body `{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid credentials" } }`
  - Password reset request (unknown email): `200` with generic `{ "data": { "message": "If an account exists with that email, a password reset link has been sent" } }` — never 404, never "account not found"
  - Password reset for SUSPENDED: `403` `ACCOUNT_SUSPENDED` "Account is suspended; contact administrator to restore access."
  - Password reset for deleted: `403` `ACCOUNT_DELETED` "Account is deleted; cannot perform password reset."
  - INVITED login attempt: same uniform `401 INVALID_CREDENTIALS` (no distinction), per Q4/A4
  - Invalid/expired/revoked/reused tokens (invitation, reset, refresh): uniform `400` `INVALID_OR_EXPIRED_TOKEN` "Invalid or expired token" with internal logging of the actual reason (Q5/A5)
- **Rationale**: Spec Q4/A4 and Q5/A5 mandate uniform responses; implementation must ensure no branch reveals account existence. Envelope follows API_GUIDELINES.md section 8 (`{ error: { code, message, details? } }`).
- **Alternatives considered**: distinct error codes per failure (rejected: account enumeration risk).

## R-010: Account types and role representation in JWT

- **Decision**: JWT payload claims: `sub` (user uuid), `userId` (user id), `accountType` (`PLATFORM` | `ORGANIZATION`), `organizationId` (nullable; null for PLATFORM_OWNER), `role` (`PLATFORM_OWNER` | `ADMINISTRADOR` | `GERENTE` | `OPERADOR`). The `role` is resolved from the user's role relation (organization users) or from the platform-owner flag (PLATFORM users).
- **Rationale**: Spec section "JWT" mandates exactly these claims; PLATFORM_OWNER has `organizationId=null`.
- **Alternatives considered**: embedding a permission list in the JWT (out of scope — no per-permission model in v1); role claim omitted and re-fetched per request (adds a DB hit per request and complicates guards).

## R-011: Role model mapping (APPROVED 2026-08-13 — HUMAN GATE)

- **Decision**: The `Role` table keeps organization-scoped roles; `RoleType` enum changes from `{ ADMINISTRADOR, GERENTE, ASESOR }` to `{ ADMINISTRADOR, GERENTE, OPERADOR }` (ASESOR -> OPERADOR). PLATFORM_OWNER is represented via a nullable `accountType`/flag on `User` (or a platform role row with `organizationId = null`), NOT via a tenant-scoped role.
- **Migration rule (human-approved)**: existing `ASESOR` roles migrate to `OPERADOR`; User→Role relationships preserved; Role IDs preserved where constraints allow; no silent deletion of users, organizations, or role assignments.
- **Rationale**: Constitution V and the finalized spec define the authoritative role set. ASESOR is a legacy value; the mapping was explicitly confirmed by a human on 2026-08-13 (HUMAN GATE approval).
- **Alternatives considered**: keeping ASESOR as an alias (contradicts the approved decisions); creating an `OWNER` role (explicitly forbidden by Constitution V note).

## R-012: Tenant isolation enforcement point

- **Decision**: Enforce tenant boundary in two layers:
  1. `JwtAuthGuard` + `RolesGuard` (global or per-controller) validate the JWT and resolve `organizationId` from the token.
  2. A `TenantScopeInterceptor`/helper injects `organizationId` into every tenant-scoped Prisma query (`where: { organizationId: currentUser.organizationId }`); `PLATFORM_OWNER` (`organizationId=null`) bypasses the tenant filter.
- **Rationale**: Spec FR-013/NR-009/NR-010: `organizationId` is never trusted from the client; it is always derived from authenticated identity. A central tenant-scoping mechanism prevents per-module mistakes.
- **Alternatives considered**: per-query manual filtering everywhere (error-prone, violates "no N+1 / isolation must be enforced" and Constitution IV); middleware rewriting requests (hides intent, harder to test).

## R-013: Dependency additions

- **Decision**: Add `@nestjs/jwt` to `apps/api` (only new runtime dependency).
- **Rationale**: See R-001. No other new dependencies are required; bcrypt, passport, passport-jwt, cookie-parser, class-validator, joi are already present.
- **Alternatives considered**: using `jsonwebtoken` directly (no new package but loses DI); reimplementing JWT (rejected: security risk).