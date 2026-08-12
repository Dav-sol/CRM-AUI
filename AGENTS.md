# AGENTS.md

## Project Mission

Automatize It Platform is a B2B SaaS platform for post-sale customer
follow-up and customer loyalty automation.

The repository is developed using Spec-Driven Development and
Agentic Development.

## Source of Truth

Before implementing or modifying functionality, inspect the relevant
documents under `specs/`.

Priority:

1. Explicit user instructions
2. Relevant specifications under `specs/`
3. Existing architectural decisions in the repository
4. Existing implementation
5. General engineering conventions

Never invent domain rules when the specifications do not define them.

If specifications conflict with each other, STOP and report the
conflict before implementing the affected functionality.

## Agent Safety Rules

Before modifying code:

- Identify the relevant specification files.
- Explain the intended implementation briefly.
- Identify affected modules/files.
- Identify architectural or domain decisions that may be ambiguous.

Do not:

- Modify unrelated files.
- Rewrite existing architecture without justification.
- Introduce dependencies without explaining why.
- Change database semantics without checking the specifications.
- Delete historical/business data models without explicit approval.
- Hardcode secrets or credentials.
- Commit secrets, `.env` files, credentials or API keys.

For destructive operations, database migrations, dependency changes,
or architectural changes, request confirmation unless explicitly
authorized by the task.

## Architecture

The system follows:

- Monorepo with Turborepo
- NestJS backend
- PostgreSQL + Prisma
- Redis + BullMQ
- Event-driven module communication
- Clean Architecture
- DDD
- Modular feature-based architecture

Backend dependency direction:

Controller -> Service -> Repository -> Database

Modules must remain independently testable and loosely coupled.

Modules must communicate through domain/application events when
the architecture specifies event-driven communication.

## Backend Standards

Language:

- Code: English
- Database identifiers: English
- API identifiers: English
- Variables: camelCase
- Classes/interfaces/types: PascalCase
- Files/directories: kebab-case
- Documentation/UI: Spanish

Database:

- Prisma is the only database access layer.
- Avoid N+1 queries.
- Use transactions where required.
- Use indexes for important lookup paths.
- Preserve historical/business records according to the specs.

Validation:

- Use Zod and class-validator according to the project standards.
- DTOs are mandatory for API input.

Errors:

- Use controlled NestJS exceptions.
- Never expose internal implementation errors to API consumers.

Security:

- Secrets only through environment variables.
- JWT/RBAC according to the specifications.
- Never expose credentials in logs.
- Never commit secrets.

API responses:

{
  "success": true,
  "data": {},
  "message": "",
  "errors": []
}

Testing:

- Add unit tests for business logic.
- Add integration tests for persistence/business boundaries.
- Maintain the project's target of >80% coverage.

Quality:

- ESLint
- Prettier
- TypeScript strictness
- Conventional Commits

## Multi-Tenancy

The application is multi-tenant.

Business entities must respect organization isolation.

Every tenant-scoped query must enforce the appropriate organization
boundary.

Never introduce a query that can access another organization's data.

Do not assume the exact domain model for organization ownership when
the specifications are ambiguous.

## Event-Driven Rules

Avoid direct coupling between business modules when an event-driven
interaction is specified.

Example:

PurchaseImported
    ->
AutomationCreated
    ->
MessageQueued

Events must have explicit names and typed payloads.

## Current Known Decisions Requiring Human Resolution

The repository currently contains known inconsistencies.

Do NOT resolve these autonomously:

### Roles

The Prisma schema currently contains:

- OWNER
- ADMIN
- MANAGER
- AGENT

The specifications describe:

- Administrador
- Gerente
- Asesor
- Operador

The mapping and the existence/semantics of OWNER versus Operador must
be resolved explicitly before implementing final RBAC behavior.

### Multi-Tenancy

The specifications require organization-level isolation.

Before implementing domain modules, verify that all tenant-scoped
entities and relationships correctly support organization isolation.

Do not silently add or remove organization relationships without
checking the domain model specifications.

### Documentation

If README.md, vision documents, or other specifications are incomplete,
do not invent missing requirements.

Report the missing information.

## Implementation Workflow

For every non-trivial task:

1. Read relevant specs.
2. Inspect existing implementation.
3. Identify constraints.
4. Identify contradictions.
5. Propose implementation.
6. Implement only the requested scope.
7. Run formatting/lint/typecheck/tests.
8. Review the diff.
9. Report what changed and what remains.

## Autonomous Mode

The agent may autonomously perform routine, reversible engineering
tasks when they are clearly defined by the specifications.

Examples:

- Create boilerplate files.
- Implement explicitly specified DTOs.
- Implement explicitly specified services.
- Add tests.
- Run lint/typecheck/tests.
- Fix straightforward type errors.
- Refactor without changing behavior.

The agent must stop and ask for confirmation for:

- Domain decisions not defined by specs.
- Conflicting specifications.
- Destructive database changes.
- Production infrastructure changes.
- Security-sensitive architectural decisions.
- Major dependency changes.
- Changes that alter public API contracts.
- Changes that alter persisted domain semantics.

## Definition of Done

A task is not complete merely because the code compiles.

Before declaring completion:

- Relevant specs were checked.
- Implementation follows project architecture.
- Tests were added/updated.
- Typecheck passes.
- Lint passes.
- Formatting passes.
- No unrelated files were modified.
- No secrets were introduced.
- Database migrations are reviewed when applicable.
- Git diff has been inspected.
