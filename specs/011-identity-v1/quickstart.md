# Quickstart — Identity v1 Validation Guide

Phase 1 output for `specs/011-identity-v1`. Runnable validation scenarios proving Identity v1 works end-to-end. Implementation details live in `tasks.md` (Phase 2); this file is the validation/run guide.

Prerequisites, commands, and expected outcomes below. Contract details: `contracts/identity-api.md`. Data model: `data-model.md`.

## Prerequisites

- PostgreSQL running, `DATABASE_URL` set
- Redis available (`REDIS_URL` set) for existing infrastructure
- Env vars per `research.md` R-006 (refresh secret, TTLs, cookie name)
- API running: `pnpm --filter api start:dev` (or `npm run start:dev` in `apps/api`)

## Setup

```bash
# 1. Apply schema (after human-confirmed migration review — see plan.md gates)
cd apps/api
npx prisma migrate dev --name identity-v1

# 2. Seed baseline (existing tooling or manual):
#    - one PLATFORM_OWNER user (accountType=PLATFORM, organizationId=null, role=PLATFORM_OWNER)
#    - one organization with ADMINISTRADOR, GERENTE, OPERADOR users
#    - role rows: ADMINISTRADOR, GERENTE, OPERADOR

# 3. Verify API starts
npm run start:dev
```

## Validation Scenarios

### S1. Organization user login + JWT claims
```bash
curl -s -X POST /api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@org1.test","password":"ValidPass123"}'
```
**Expected**: `200`; body `data.accessToken` decodes to claims `sub`, `userId`, `accountType=ORGANIZATION`, `organizationId=<org1>`, `role=ADMINISTRADOR`; `Set-Cookie` contains HttpOnly `refresh_token`.

### S2. PLATFORM_OWNER login
```bash
curl -s -X POST /api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"owner@platform.test","password":"ValidPass123"}'
```
**Expected**: `200`; claims `accountType=PLATFORM`, `organizationId=null`, `role=PLATFORM_OWNER`.

### S3. Anti-enumeration login (unknown email / wrong password)
```bash
curl -s -X POST /api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"Whatever123"}'
# and wrong password for an existing account
```
**Expected**: both `401` `INVALID_CREDENTIALS` "Invalid credentials"; responses identical.

### S4. INVITED cannot log in
**Precondition**: user with status INVITED (created via invitation, before acceptance).
```bash
curl -s -X POST /api/v1/auth/login -d '{"email":"invited@org1.test","password":"Whatever123"}'
```
**Expected**: uniform `401 INVALID_CREDENTIALS` (no "account not found" distinction).

### S5. Refresh + rotation
```bash
curl -s -X POST /api/v1/auth/refresh -b 'refresh_token=<cookie>'
```
**Expected**: `200` new access token; new refresh cookie issued (rotation, R-004). Reusing the OLD cookie → `400 INVALID_OR_EXPIRED_TOKEN`.

### S6. SUSPENDED / deleted cannot renew
**Precondition**: user suspended; user with deletedAt set (each with an existing session).
```bash
curl -s -X POST /api/v1/auth/refresh -b 'refresh_token=<cookie>'
```
**Expected**: `401 INVALID_CREDENTIALS` (FR-007/NR-006).

### S7. Logout revokes session
```bash
curl -s -X POST /api/v1/auth/logout -b 'refresh_token=<cookie>' -H 'Authorization: Bearer <access>'
```
**Expected**: `200`; subsequent refresh with same cookie → `400 INVALID_OR_EXPIRED_TOKEN`.

### S8. Tenant isolation
**Precondition**: user of org1; resource in org2 (e.g., customer/purchase route).
```bash
curl -s /api/v1/customers?organizationId=<org2> -H 'Authorization: Bearer <org1-token>'
```
**Expected**: `403 FORBIDDEN` (organizationId from JWT enforced; client value ignored — NR-009/010).

### S9. PLATFORM_OWNER cross-tenant access
```bash
curl -s /api/v1/customers -H 'Authorization: Bearer <platform-owner-token>'
```
**Expected**: `200`; data from any organization (PLATFORM bypasses tenant filter).

### S10. Invitation lifecycle
```bash
# ADMINISTRADOR invites within own org
curl -s -X POST /api/v1/invitations -H 'Authorization: Bearer <admin-org1-token>' \
  -H 'Content-Type: application/json' -d '{"email":"new@org1.test","roleId":"<operador-role>"}'
# PLATFORM_OWNER invites to any org
curl -s -X POST /api/v1/invitations -H 'Authorization: Bearer <platform-token>' \
  -d '{"email":"new@org2.test","roleId":"<gerente-role>"}'
# GERENTE/OPERADOR attempt
curl -s -X POST /api/v1/invitations -H 'Authorization: Bearer <gerente-org1-token>' \
  -d '{"email":"x@org1.test","roleId":"<operador-role>"}'
# Accept
curl -s -X POST /api/v1/invitations/accept -H 'Content-Type: application/json' \
  -d '{"token":"<invitation-token>","password":"NewPass123"}'
```
**Expected**: first two `201`; GERENTE attempt `403 FORBIDDEN`; accept `201` creating the User (INVITED → ACTIVE) with session issued. Reusing the same invitation token → `400 INVALID_OR_EXPIRED_TOKEN`. Expired token → `400 INVALID_OR_EXPIRED_TOKEN`.

### S11. Password reset
```bash
curl -s -X POST /api/v1/auth/password-reset/request -d '{"email":"admin@org1.test"}'
curl -s -X POST /api/v1/auth/password-reset/confirm -d '{"token":"<reset-token>","password":"NewPass456"}'
```
**Expected**: request `200` with generic message; confirm `200`; old password no longer works; token reuse → `400 INVALID_OR_EXPIRED_TOKEN`.

### S12. Password reset state matrix
| User state | Expected |
|------------|----------|
| ACTIVE | `200` generic; token delivered |
| INVITED | `200` generic; no token (blocked) |
| SUSPENDED | `403 ACCOUNT_SUSPENDED` |
| deletedAt | `403 ACCOUNT_DELETED` |
| Unknown email | `200` generic; no token |

## Quality gates

```bash
cd apps/api
npm run lint
npm run build
npm run test          # unit: *.spec.ts
npm run test:e2e      # e2e: test/jest-e2e.json
npm run test:cov      # target >80% coverage (Constitution X)
```

## Expected completion signals

- All S1–S12 scenarios pass
- Unit + integration coverage >80% for auth, users, invitations, password-reset modules
- Lint, typecheck, build clean
- No secrets in code or logs; JWT/refresh secrets only in env
- Migration reviewed and approved per Constitution VIII before execution