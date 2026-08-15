# Automatizaciones v1 — Research Notes

## R-001 — Models exist (schema.prisma:170-233)

`model CommercialCycle` (:170-185): `purchaseId` unique, `status` (default ACTIVE), `startDate`, `endDate?`, `createdAt`, `updatedAt`, `deletedAt`; relations `purchase`, `automations[]`; `@@map("commercial_cycles")`. **NO `organizationId` field** — the organization boundary is reached through the related `purchase.organizationId` (Purchase has `organizationId`, :140). `model Automation` (:207-233): `organizationId`, `campaignId?`, `purchaseId`, `commercialCycleId?`, `scheduledDate`, `executedDate?`, `status` (default PENDING), `priority` (default 0); relations `organization`, `campaign?`, `purchase`, `commercialCycle?`, `messages[]`; indexes `[organizationId]`, `[purchaseId]`, `[scheduledDate]`, `[status]`. **Missing for v1**: actor fields (`createdBy`/`updatedBy`/`deletedBy`) on both models and compound index `[organizationId, status]` on Automation (list path FR-006).

## R-002 — Enums (schema.prisma:454-482)

`CommercialCycleStatus {ACTIVE, FINISHED, CANCELLED}` — maps to 04-domain-model.md:85-91 (Activo/Finalizado/Cancelado), no change. `AutomationStatus {PENDING, SCHEDULED, EXECUTED, CANCELLED, ERROR, PAUSED}` — maps AU-002 states (Pendiente/Programada/Ejecutada/Cancelada/Error) + PAUSED reserved for AU-006 (HG-3). No enum changes required.

## R-003 — Event infrastructure ready

`@nestjs/event-emitter` installed (`@nestjs/event-emitter@^3.1.0`), `EventEmitterModule.forRoot()` registered (`app.module.ts:27`), imports already emits events via `EventEmitter2` (`imports.processor.ts:2,36,463-466`). `PurchaseImported` payload: `{ importId, purchaseId, invoiceNumber }` (`imports.processor.ts:450-454`), wrapped in `ImportEventEnvelope` (`imports.events.ts:4-28`: eventId uuid, occurredAt, userId, organizationId, module, state, payload). Consumer in Automations: `@OnEvent('PurchaseImported')`, use `payload.purchaseId` (the Prisma Purchase `id`, CUID) to load the purchase.

## R-004 — No scheduler/queue infra

No `@nestjs/schedule`, BullMQ or worker (`08:261,271` future; imports HG-3). HG-2 confirms no scheduler in v1. The module is purely event + request driven.

## R-005 — Tenant enforcement pattern (precedent)

`TenantScopeGuard` MUST NOT be used (purchases R-001 precedent); tenant enforcement in the service layer (`findScoped` pattern, products.service.ts). Cross-tenant access → 404 (customers/purchases/products precedent). `CommercialCycle` has no `organizationId`: scope queries by the cycle's purchase relation — `findFirst({ where: { uuid, purchase: { organizationId } } })` with `include: { purchase: true }`, or scope the parent automation then cycle. Automation scopes by its own `organizationId`.

## R-006 — Role pattern (precedent)

Writes: `@Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE')` (products.controller.ts:48-66); OPERADOR read-only (imports HG-11 precedent). Guards: `apps/api/src/core/guards/{jwt-auth,roles,tenant-scope}.guard.ts` + `core/decorators/roles.decorator.ts`. Automations v1: reads all roles; cancel writes = PO+ADMIN+GERENTE (Q11).

## R-007 — Audit pattern (precedent)

`AuditIdentityService.record({module, action, outcome, userId, organizationId, description, metadata})` never-throws (`audit.identity.service.ts:52-64`); action = `{action}.{outcome}`. Automations v1: `module: 'automations'`, actions `automation.cycle.created/.cancelled`, `automation.created/.cancelled` (FR-011). For event-driven creation (no user), `userId` = null; `organizationId` from the purchase/cycle.

## R-008 — Idempotent consumer (design)

On `PurchaseImported`: `findUnique({ where: { purchaseId } })` on CommercialCycle (unique, :173). If exists → no-op (07:375-379). Else load the purchase (with customer), detect AU-003 (customer has ACTIVE cycle), then in one transaction create/replace cycle + 3 automations. P2002 unique violation on `purchaseId` (concurrent replays) → catch, re-check, treat as no-op (NR-006). Customer active check (AU-005) is an execution-time rule (Flujo 05 step 3), NOT applied at creation in v1 (HG-1) — record in spec/research.

## R-009 — AU-003 semantics (design)

"Si un cliente realiza una nueva compra antes de finalizar el ciclo anterior" (03:199-205). Interpretation (Q6): for the purchase's customer, find an ACTIVE cycle via that customer's purchases (`purchase.customerId`). If ACTIVE cycle exists: update its PENDING/SCHEDULED automations → CANCELLED (updateMany, predicate on status), set cycle → CANCELLED + `endDate = now`; then create new ACTIVE cycle + 3 automations. All in one transaction (NR-004). **INFERENCIA**: the spec says "pendientes del ciclo anterior" (pending automations) — EXECUTED are never touched (AU-004).

## R-010 — Cadence calculation (design, HG-5)

`scheduledDate = purchaseDate + 3 days / + 6 months / + 12 months`. Month arithmetic: use a helper that adds calendar months (not 30-day constants) so 6/12 months preserve the day (clamp to month length, e.g., Aug 31 + 6mo → Feb 28/29). Times at start of day? **Decision**: keep the exact purchase time + offset to preserve ordering; store UTC. **INFERENCIA** (not prescribed). Future scheduler/WhatsApp decides delivery window per AU-009 (deferred).

## R-011 — OpenAPI scaffolds (state)

`specs/api/paths/automations.yaml` (0 bytes) + `specs/api/components/schemas/Automation/` (7 files, 0 bytes). **NO scaffolds for CommercialCycle** — must be created. Root openapi.yaml (a3ffbf8) wires paths via per-path `$ref` with `~1`-escaped JSON pointers; validation chain: `api:lint` (redocly --config .redocly.yaml) + `api:spectral` (bundles to dist then lints). New paths must follow the same wiring + re-run `api:validate`.

## R-012 — SDK/orval state

`orval.config.ts` targets `packages/sdk` which does not exist; `api:generate` never run — out of scope (report only, precedent imports R-016).

## R-013 — Test infrastructure (state)

Unit: 223/223; e2e: 98/98; combined 321/321 (imports closure, 2026-08-15). Imports coverage: statements 83.24%, lines 83.36% (unit, >80%). Automations suites: `automations.service.spec.ts`, `automations.controller.spec.ts`, `automations.e2e-spec.ts` with org/role/bcrypt seed pattern (products.e2e-spec.ts).

## R-014 — Event-driven creation actor (design)

Cycle/automation creation is system-triggered (no HTTP user). `createdBy` = null (or the import user, if propagated — **INFERENCIA**: Imports does not currently propagate the job user into PurchaseImported; null is safe). `organizationId` on Automation = purchase.organizationId. Audit metadata records the triggering purchase uuid + eventId.

## R-015 — List/query paths (design)

Cycle list tenant-scoped via `purchase.organizationId` (R-005) — a cross-entity scope; alternatively preload cycles joined with purchases (`findMany` with `where: { purchase: { organizationId } }`). Automation list scoped by its own `organizationId`. Whitelist sorts and pagination per API_GUIDELINES §14-15.

## R-016 — No manual creation (design)

POST endpoints limited to cancel (`/automations/{uuid}/cancel`). Cycle/automation creation only via the `PurchaseImported` consumer (FR-014). This keeps the aggregate consistent (CP-002, 04:327-328) and avoids bypassing AU-003.

## R-017 — Migration caution (precedent imports R-018)

Additive columns only (actor fields, indexes); no enum changes in v1 (R-002). PostgreSQL at localhost:5433 (docker-compose postgres:16). Generate via `npx prisma migrate dev --create-only --name add_automations_v1_fields`, review SQL, apply.

## R-018 — Extension points for deferred rules (HG-3/HG-4)

`PAUSED` status reserved (AU-006); `priority` field on Automation reserved (AU-010); `scheduledDate` carries cadence (AU-009 window enforcement is execution-time). The v1 status transitions (SCHEDULED → CANCELLED) are isolated in one predicate-guarded method so the future Conversations/Configuración/Campañas modules can extend without restructuring (07:422 "incorporar nuevos módulos sin modificar los existentes").