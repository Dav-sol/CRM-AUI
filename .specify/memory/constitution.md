<!--
Sync Impact Report:
- Version: 1.0.0 (no change)
- Modified principles: VI (JWT AND SESSION SECURITY), VII (IDENTITY FLOWS)
- Added: Explicit note that PLATFORM_OWNER, ADMINISTRADOR, GERENTE, OPERADOR, UserSession, Identity v1 are approved architectural decisions not yet fully implemented
- Removed: Concrete defaults (15min access, 7day refresh, 48h invitation) from constitutional principles; "inactive, logically deleted" from session renewal rule
- Deferred: Concrete token/invitation defaults moved to implementation specifications
-->

# Automatize It Platform Constitution

## Core Principles

### I. SPEC-DRIVEN DEVELOPMENT
Specifications are authoritative before implementation. The workflow is:
CONTRACT -> DESIGN -> IMPLEMENTATION -> TEST -> VALIDATION -> DOCUMENTATION -> CHECKLIST -> NEXT STAGE.
Never implement from assumptions when the specification is ambiguous.
Conflicts between specifications must stop implementation until explicitly resolved.

### II. DOMAIN AND ARCHITECTURAL DISCIPLINE
The project uses a modular NestJS backend, PostgreSQL, Prisma, Clean Architecture, DDD principles, and event-driven communication where specified.
Modules must be cohesive, loosely coupled, independently testable, and must not leak infrastructure concerns into domain rules.
Do not rewrite architecture without explicit justification.

### III. API CONTRACT FIRST
The API is RESTful, versioned under /api/v1, documented with OpenAPI 3.1, uses English resource names, DTOs, validation, standard HTTP semantics, and reusable components.
API_GUIDELINES.md and ENTITY_BLUEPRINT.md are authoritative for HTTP response format.
Individual resources use { data: {} }.
Collections use { data: [], meta: {} }.
Errors use { error: { code, message, details? } }.
Do not implement an endpoint before its OpenAPI contract is defined.

### IV. MULTI-TENANCY
The application is multi-tenant.
Tenant-scoped users and queries MUST remain isolated by organization.
The client must never choose organizationId as the authority for access.
Organization context is derived from authenticated identity.
Cross-tenant data access is forbidden.

### V. IDENTITY AND AUTHORIZATION
There are two authorization scopes.

Platform:
PLATFORM_OWNER

Organization:
ADMINISTRADOR
GERENTE
OPERADOR

PLATFORM_OWNER is a global platform role and does not belong to an organization.
Organization users belong to exactly one organization in v1.
Do not introduce Viewer, Asesor, or legacy OWNER/ADMIN/MANAGER/AGENT roles into the new authorization model.

**Note**: PLATFORM_OWNER, ADMINISTRADOR, GERENTE, OPERADOR are approved architectural decisions. Full implementation is pending.

## Additional Constraints

### VI. JWT AND SESSION SECURITY
JWT claims must contain the minimum authorization context: sub, userId, accountType, organizationId, role.
PLATFORM_OWNER has organizationId=null.
Organization users have a mandatory organizationId.
Access tokens MUST be short-lived; refresh tokens MUST be long-lived.
Refresh tokens are delivered through HttpOnly cookies and are never stored in plaintext.
Refresh tokens are persisted only as hashes through a revocable UserSession model.
Users with status SUSPENDED or with deletedAt set cannot renew sessions.

**Note**: UserSession is an approved architectural decision. Full implementation is pending. Concrete token lifetimes are defined in implementation specifications, not in this Constitution.

### VII. IDENTITY FLOWS
Identity v1 includes: login; password reset; user invitation.
Invited users cannot log in.
Invitation tokens are single-use and time-limited.
PLATFORM_OWNER may invite users to any organization.
ADMINISTRADOR may invite users only within their own organization.
GERENTE and OPERADOR cannot invite users.

**Note**: Identity v1 is an approved architectural decision. Full implementation is pending. Concrete invitation token expiry is defined in implementation specifications, not in this Constitution.

### VIII. DATA SAFETY AND MIGRATIONS
Prisma is the only database access layer.
Destructive migrations require explicit review and approval.
Never silently drop business or historical data.
Every migration must be reviewed for data loss, constraints, indexes, foreign keys, and tenant isolation before execution.

### IX. VALIDATION, ERRORS, AND SECURITY
API input requires DTOs and validation.
Use controlled NestJS exceptions.
Never expose internal errors, credentials, tokens, or secrets.
Secrets are environment variables only.
Authentication, RBAC, validation, tenant isolation, and auditability are mandatory security concerns.

### X. TESTING AND QUALITY GATES
A feature is not complete because it compiles.
Relevant unit tests, integration tests, and end-to-end tests are required.
Typecheck, lint, formatting, relevant tests, API validation, migration review, and git diff review are required quality gates.
The project targets greater than 80 percent coverage unless a specification explicitly defines otherwise.

## Development Workflow

### XI. CHANGE CONTROL AND REPRODUCIBILITY
Changes must remain within the requested scope.
Do not modify unrelated files.
Use Conventional Commits.
Every architectural or domain decision must be documented.
The repository must remain reproducible from Git, specifications, and versioned development tooling.

## Governance

### XII. GOVERNANCE
The Constitution is binding for future specifications, plans, tasks, and implementation.
When a specification conflicts with a constitutional principle, the conflict must be surfaced explicitly.
Governance changes require a documented amendment and semantic version update.
The Constitution must be reviewed during planning and implementation.

**Version**: 1.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-13
