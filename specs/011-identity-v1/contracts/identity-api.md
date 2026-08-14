# Identity v1 — API Contract

Phase 1 output for `specs/011-identity-v1`. REST API under `/api/v1` (per API_GUIDELINES.md §2). Response envelope per API_GUIDELINES.md §6-8: success `{ "data": {} }`, collections `{ "data": [], "meta": {} }`, errors `{ "error": { "code", "message", "details? } }`.

Existing OpenAPI (specs/api/paths/auth.yaml) documents `POST /auth/login`; the identity module contract below aligns with and extends it. Refresh tokens are delivered **only via HttpOnly cookie** (never in the response body) per the finalized spec.

---

## POST /auth/login

Authenticates an organization user or PLATFORM_OWNER.

**Request body** (LoginRequest):
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | yes | format: email |
| `password` | string | yes | min 8 |

**Response 200** `{ "data": { "accessToken": string, "expiresIn": number, "user": {...} } }` + `Set-Cookie: refresh_token=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`.

**Response 401** `{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid credentials" } }` — uniform for unknown email and wrong password (Q4/A4). INVITED/SUSPENDED/deleted accounts also receive this uniform 401 at login (no account-existence leak).

---

## POST /auth/refresh

Renews the access token using the refresh token from the HttpOnly cookie.

**Request**: none (cookie only). Optional body per existing `RefreshTokenRequest` for backward compatibility is **not** used by the client; cookie is the source.

**Response 200** `{ "data": { "accessToken": string, "expiresIn": number } }` + rotated refresh cookie.

**Errors**:
- `401 INVALID_CREDENTIALS` — user SUSPENDED or deletedAt set (FR-007/NR-006)
- `400 INVALID_OR_EXPIRED_TOKEN` — missing/expired/revoked/reused refresh token (Q5/A5); session revoked on reuse (R-004)

---

## POST /auth/logout

Revokes the current session (sets `revokedAt` on UserSession).

**Request**: cookie only.
**Response 200** `{ "data": { "success": true } }`; cookie cleared.
**Errors**: `401 UNAUTHORIZED` — no/invalid session.

---

## GET /auth/me

Returns the authenticated user profile and JWT context.

**Response 200** `{ "data": { "user": { id, uuid, email, firstName, lastName, accountType, organizationId, role, status } } }`.
**Errors**: `401 UNAUTHORIZED`.

---

## POST /auth/password-reset/request

Requests a password reset. Anti-enumeration: response is identical for existing and unknown emails.

**Request body**:
| Field | Type | Required |
|-------|------|----------|
| `email` | string | yes (format: email) |

**Response 200** `{ "data": { "message": "If an account exists with that email, a password reset link has been sent" } }` — for both known and unknown emails (Q1/A1, Q3/A3).

**Per-state behavior** (server-side, non-enumerating where required):
- ACTIVE: reset token issued and delivered via secure channel
- INVITED: blocked (no token) — user directed to accept invitation; **response remains generic 200** (no enumeration)
- SUSPENDED: blocked, `403 ACCOUNT_SUSPENDED` "Account is suspended; contact administrator to restore access."
- deletedAt set: blocked, `403 ACCOUNT_DELETED` "Account is deleted; cannot perform password reset."
- Unknown email: generic 200, no token issued

---

## POST /auth/password-reset/confirm

Completes the reset with a valid single-use token.

**Request body**:
| Field | Type | Required |
|-------|------|----------|
| `token` | string | yes |
| `password` | string | yes (min 8) |

**Response 200** `{ "data": { "success": true } }`; token invalidated (single-use, FR-012).
**Errors**: `400 INVALID_OR_EXPIRED_TOKEN` for expired/used/malformed tokens (Q5/A5).

---

## POST /invitations

Creates a user invitation. Authorization enforced from authenticated identity (FR-009/010/011).

**Request body**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | yes | format: email |
| `roleId` | string | yes | must resolve to ADMINISTRADOR/GERENTE/OPERADOR in the target organization |

**Authorization**:
- PLATFORM_OWNER: any `organizationId` (from body) — may invite to any organization
- ADMINISTRADOR: `organizationId` must equal own org — otherwise `403 FORBIDDEN`
- GERENTE/OPERADOR: `403 FORBIDDEN` (cannot invite)

**Response 201** `{ "data": { "id": string, "email": string, "expiresAt": string } }` (invitation token is single-use; delivered via email, never returned in response).
**Errors**: `403 FORBIDDEN`, `409 CONFLICT` (pending invitation exists for email), `400 VALIDATION_ERROR`.

---

## POST /invitations/accept

Accepts an invitation, creating the User record and transitioning INVITED → ACTIVE (Q2/A2).

**Request body**:
| Field | Type | Required |
|-------|------|----------|
| `token` | string | yes |
| `password` | string | yes (min 8) |

**Response 201** `{ "data": { "accessToken": string, "expiresIn": number, "user": {...} } }` — session starts immediately.
**Errors**: `400 INVALID_OR_EXPIRED_TOKEN` for expired/revoked/reused/malformed tokens (Q5/A5).

---

## Authorization headers

All endpoints except `POST /auth/login`, `POST /auth/refresh`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, `POST /invitations/accept` require:

```
Authorization: Bearer <accessToken>
```

JWT claims: `sub` (user uuid), `userId`, `accountType` (`PLATFORM`|`ORGANIZATION`), `organizationId` (nullable), `role` (`PLATFORM_OWNER`|`ADMINISTRADOR`|`GERENTE`|`OPERADOR`).

## Tenant isolation (contract-level)

- `organizationId` is never accepted from the client as an authorization source (FR-013/NR-009)
- Every tenant-scoped query filters by the authenticated user's `organizationId` (NR-010)
- PLATFORM_OWNER (`organizationId=null`) bypasses tenant filters
- Cross-tenant access → `403 FORBIDDEN`