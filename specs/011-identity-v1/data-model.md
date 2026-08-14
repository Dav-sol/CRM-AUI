# Data Model: Identity v1

Phase 1 output for `specs/011-identity-v1`. Describes the Prisma entities involved in Identity v1, mapped to the existing `apps/api/prisma/schema.prisma`. **No migration is executed in this phase**; schema changes below are the implementation target and are subject to the flagged human confirmations (Constitution VIII).

## Conventions

- Identifiers: `id` (cuid) + `uuid` (unique) per existing schema convention
- Soft delete via `deletedAt` per API_GUIDELINES.md §14
- Tenant entities carry `organizationId` + `@@index([organizationId])`
- Snake_case DB mapping via `@map` per existing schema

---

## 1. User (modified)

Current model in `schema.prisma:39-62` requires changes to support PLATFORM_OWNER and the approved role set.

| Field | Current | Proposed | Notes |
|-------|---------|----------|-------|
| `organizationId` | `String` (required) | `String?` (nullable) | PLATFORM_OWNER has no organization (accountType=PLATFORM, organizationId=null) |
| `roleId` | `String` (required) | `String?` (nullable) | PLATFORM_OWNER has no organization-scoped role |
| `accountType` | — | `AccountType @default(ORGANIZATION)` | **NEW**; discriminates PLATFORM vs ORGANIZATION |
| `status` | `UserStatus @default(INVITED)` | unchanged | ACTIVE / INVITED / SUSPENDED |
| `email` | `String @unique` | unchanged | |
| `passwordHash` | `String` | unchanged | bcrypt hash (R-008) |
| `deletedAt` | `DateTime?` | unchanged | SUSPENDED + deletedAt block session renewal (FR-007) |

Relationships:
- `User.organization` — optional (null for PLATFORM_OWNER)
- `User.role` — optional (null for PLATFORM_OWNER)
- `User.sessions UserSession[]` — NEW, one-to-many
- `User.invitationsSent Invitation[] @relation("Inviter")` — NEW
- `User.passwordResets PasswordResetToken[]` — NEW

**Domain invariants** (Decision 3, HUMAN GATE approved 2026-08-13):
- PLATFORM account: `accountType = PLATFORM`, `organizationId IS NULL`, role `PLATFORM_OWNER`.
- ORGANIZATION account: `accountType = ORGANIZATION`, `organizationId IS NOT NULL`, `roleId IS NOT NULL`.
- Nullable database columns MUST NOT be interpreted as optional tenant membership for organization users.
- PLATFORM_OWNER is NOT tenant-bound; no reserved/fake `PLATFORM` organization is created (Decision 2).

**State transitions** (spec Invitation Lifecycle, Q2/A2):

```
[invitation accepted]           [revocation / admin]
        |                                |
        v                                v
     INVITED ───────────► ACTIVE ◄───────┘
        │                     │
        └── (never logs in)   └──► SUSPENDED  (renewal blocked)
                                └──► deletedAt set (renewal blocked)
```

- User record is created **during invitation acceptance** (not initiation); status = INVITED at creation, transitions to ACTIVE immediately after token validation; password setup completes the transition (Q2/A2).
- INVITED cannot log in (FR-006); SUSPENDED/deletedAt cannot renew sessions (FR-007).

---

## 2. Role (enum change — APPROVED 2026-08-13)

Current enum `RoleType` in `schema.prisma:326-330`:

```prisma
enum RoleType {
  ADMINISTRADOR
  GERENTE
  ASESOR        // legacy value
}
```

**Required change** (Constitution V, spec authorization):

```prisma
enum RoleType {
  ADMINISTRADOR
  GERENTE
  OPERADOR      // replaces ASESOR
}
```

- **APPROVED 2026-08-13 (HUMAN GATE)**: existing `ASESOR` roles migrate to `OPERADOR`; User→Role relationships preserved; Role IDs preserved where database constraints allow; no users, organizations, or role assignments silently deleted.
- `Role.organizationId` is already nullable — used for organization-scoped roles only; PLATFORM_OWNER is NOT stored as a Role row (represented via `User.accountType = PLATFORM`).

---

## 3. UserSession (NEW)

Spec FR-014, NR-004/NR-005; Constitution VI. One row per currently-valid refresh token.

```prisma
model UserSession {
  id               String    @id @default(cuid())
  uuid             String    @unique @default(uuid())
  userId           String    @map("user_id")
  refreshTokenHash String    @map("refresh_token_hash")   // SHA-256 of opaque token (R-002)
  userAgent        String?   @map("user_agent")
  ip               String?
  expiresAt        DateTime  @map("expires_at")           // refresh TTL (R-003)
  lastUsedAt       DateTime? @map("last_used_at")
  revokedAt        DateTime? @map("revoked_at")           // revocation without hard delete
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([refreshTokenHash])   // lookup path for refresh
  @@index([expiresAt])          // cleanup of expired sessions
  @@map("user_sessions")
}
```

Rules:
- Refresh token never stored in plaintext (NR-004); only the hash.
- Rotation: on each renewal, replace hash; previous hash invalid (R-004).
- Revocation: set `revokedAt` (logout, reuse detection, admin revoke).
- Renewal blocked when: no matching hash, `revokedAt` set, `expiresAt` passed, or user is SUSPENDED / has `deletedAt` (FR-007, NR-006).

---

## 4. Invitation (NEW)

Spec Invitation Lifecycle; single-use + time-limited (FR-008, NR-007). Persistence is required to enforce single-use.

```prisma
model Invitation {
  id            String      @id @default(cuid())
  uuid          String      @unique @default(uuid())
  organizationId String     @map("organization_id")
  invitedById   String      @map("invited_by_id")
  email         String
  roleId        String      @map("role_id")          // role granted on acceptance
  tokenHash     String      @map("token_hash")       // SHA-256 of opaque token (R-002)
  status        InvitationStatus @default(PENDING)
  expiresAt     DateTime    @map("expires_at")       // invitation TTL (R-003)
  acceptedAt    DateTime?   @map("accepted_at")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  organization  Organization @relation(fields: [organizationId], references: [id])
  invitedBy     User         @relation("Inviter", fields: [invitedById], references: [id])

  @@index([organizationId])
  @@index([email])
  @@index([tokenHash])
  @@index([status])
  @@map("invitations")
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
```

Rules:
- Authorization at creation: PLATFORM_OWNER → any organization; ADMINISTRADOR → own organization only; GERENTE/OPERADOR → forbidden (FR-009/010/011).
- Token: single-use (status PENDING → ACCEPTED once), time-limited (`expiresAt`).
- Acceptance creates the User (INVITED → ACTIVE flow per Q2/A2) with the invited role and organization.
- Invalid presentations (expired/revoked/reused/malformed) → uniform `400 INVALID_OR_EXPIRED_TOKEN`; actual reason logged internally (Q5/A5).

---

## 5. PasswordResetToken (NEW)

Spec Password Reset Lifecycle; single-use + time-limited (FR-012).

```prisma
model PasswordResetToken {
  id         String    @id @default(cuid())
  uuid       String    @unique @default(uuid())
  userId     String    @map("user_id")
  tokenHash  String    @map("token_hash")     // SHA-256 of opaque token (R-002)
  expiresAt  DateTime  @map("expires_at")     // reset TTL (R-003)
  usedAt     DateTime? @map("used_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([tokenHash])
  @@map("password_reset_tokens")
}
```

Rules:
- Request allowed only for ACTIVE users (Q1/A1, Q3/A3).
- INVITED: blocked before acceptance; allowed after ACTIVE.
- SUSPENDED: `403 ACCOUNT_SUSPENDED`. Deleted: `403 ACCOUNT_DELETED`. Unknown email: generic 200 message, no token issued (anti-enumeration).
- Single-use (`usedAt`), time-limited (`expiresAt`); invalid presentations → uniform `400 INVALID_OR_EXPIRED_TOKEN` (Q5/A5).
- Completion invalidates the token and all previous passwords remain replaced (FR-012).

---

## 6. Audit (modified)

Existing model in `schema.prisma:298-318`; supports AD-001/AD-002 audit of identity events (T065).

| Field | Current | Proposed | Notes |
|-------|---------|----------|-------|
| `organizationId` | `String` (required) | `String?` (nullable) | Platform/system scope: `null` for PLATFORM_OWNER and pre-auth events; NEVER from client input |

Rules (per AD-001 decision, 2026-08-13):
- Organization-user events: `organizationId` from the authenticated actor's trusted organization context only.
- PLATFORM_OWNER events: `organizationId = null`.
- Pre-auth events (e.g., unknown email login/reset attempts): `organizationId = null`.
- `organizationId` MUST NEVER be inferred from or accepted from client-provided input (FR-013/NR-009).
- Tenant-scoped audit queries MUST explicitly handle `null` organizationId as platform/system scope.
- Identity events recorded: login success/failure, session creation/refresh/reuse-detection/revocation/logout, invitation creation/acceptance, password-reset request/success (T065).
- Never persist passwords, raw JWTs, refresh/invitation/reset tokens, or other credentials/secrets (T065).
- **APPROVED 2026-08-13 (HUMAN GATE)** — included in the T005/T006 migration.

---

## 7. Enums (summary)

| Enum | Change |
|------|--------|
| `UserStatus` | unchanged: `ACTIVE`, `INVITED`, `SUSPENDED` |
| `AccountType` | **NEW**: `PLATFORM`, `ORGANIZATION` |
| `RoleType` | **CHANGED**: `ADMINISTRADOR`, `GERENTE`, `OPERADOR` (ASESOR→OPERADOR — APPROVED 2026-08-13) |
| `InvitationStatus` | **NEW**: `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED` |

---

## Validation Rules (from spec requirements)

- Login: `email` (format email), `password` required — DTO + class-validator (FR-001)
- Login failure: uniform `401 INVALID_CREDENTIALS` (Q4/A4)
- Invitation create: `email` (format email), `roleId` (must be ADMINISTRADOR/GERENTE/OPERADOR), `organizationId` — enforced server-side from identity (FR-013)
- Invitation accept: token + `password` (min strength per project DTO standards)
- Password reset request: `email`; reset confirm: token + `password`
- All inputs validated via DTOs (Constitution IX; project standard)