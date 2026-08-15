# Automatizaciones v1 — Feature Specification

## 1. Purpose

The Automatizaciones module (Módulo 05, `specs/02-modules.md:136-162`) programs automatic actions derived from purchases. Every purchase generates a commercial cycle with three scheduled automations (AU-001: 3-day follow-up, 6-month reminder, 12-month reminder; `01-mvp.md:96-97`). The module owns the CommercialCycle and Automation aggregates (`04-domain-model.md:79-109`), consumes the `PurchaseImported` event emitted by Imports (`07-event-architecture.md:164`), and manages the automation lifecycle (states per AU-002, cancellation on new purchase per AU-003).

## 2. Clarifications (Q&A)

- **Q1: What is the v1 scope?** → A1: Cycle creation + management, WITHOUT execution (HG-1). Creating a CommercialCycle + 3 automations on `PurchaseImported` (AU-001), listing/detailing cycles and automations, cancelling pending automations on a new purchase (AU-003), manual cancel of a pending automation, states per AU-002. Execution (Flujo 05, `05-user-flows.md:144-164`), message sending and AU-011 double-send guard are the responsibility of the future WhatsApp/Messages module (HG-1).
- **Q2: Is a scheduler introduced?** → A2: No (HG-2). No `@nestjs/schedule` in v1 (coherent with Imports HG-3, `08-system-architecture.md:261,271` — BullMQ/worker future). States are managed via events/API; the scheduler arrives with WhatsApp.
- **Q3: AU-006/007/008 (pause on open conversation) and AU-009 (business hours)?** → A3: Deferred, hooks prepared (HG-3). The `PAUSED` state already exists in the enum (`schema.prisma:481`); the pause/resume/notification logic belongs to the future Conversations/Configuración modules (`07:294-303`, `03-business-rules.md:221-267`). The module leaves clean extension points (status predicates) and does not implement conversation/business-hours checks in v1.
- **Q4: AU-010 (max 1 per period + campaign priority)?** → A4: Deferred (HG-4). The `priority` field exists (`schema.prisma:217`); v1 only creates the three AU-001 automations per cycle, so no same-period collisions occur. Campaign-driven priority belongs to the future Campañas module (`03:257-267`).
- **Q5: How are the three AU-001 dates calculated?** → A5: `scheduledDate = purchaseDate + 3 days / + 6 months / + 12 months` (HG-5, INFERENCIA; `01-mvp.md:96-97` "Día 3/Mes 6/Mes 12"; `02-modules.md:144-146`). Computed at cycle creation, in the organization's timezone context derived from the purchase date (UTC stored).
- **Q6: What happens on a new purchase for the same customer?** → A6: Per AU-003 (`03:199-205`): if the customer has an ACTIVE cycle, its PENDING/SCHEDULED automations are cancelled (status CANCELLED) and the cycle is marked CANCELLED; a new ACTIVE cycle is created based on the most recent purchase. Aligned with `04-domain-model.md:327-330` (one active cycle per purchase line). Idempotent consumer (07:375-379): replays never duplicate cycles.
- **Q7: What states does v1 manage?** → A7: AU-002 states (`03:187-197`): Pendiente (PENDING), Programada (SCHEDULED), Ejecutada (EXECUTED — reserved, set by future execution), Cancelada (CANCELLED), Error (ERROR — reserved). Plus PAUSED (reserved for AU-006, HG-3). v1 transitions: SCHEDULED (created) → CANCELLED (AU-003/manual); manual cancel only from PENDING/SCHEDULED.
- **Q8: Which automations can be manually cancelled?** → A8: PENDING and SCHEDULED only (HG-1, INFERENCIA). EXECUTED never re-runs (AU-004, `03:209-212` — enforced by not allowing cancel/execution on EXECUTED); CANCELLED is final.
- **Q9: Which events are emitted?** → A9: `CommercialCycleStarted`, `AutomationCreated` (on creation); `AutomationCancelled`, `CommercialCycleCancelled` (on cancellation) per `07-event-architecture.md:172-198`. Payload with traceability (07:383-395) and idempotent consumers (07:375-379). No execution events in v1 (`AutomationScheduled/Executed/Failed` reserved).
- **Q10: Which entity naming and tenancy apply?** → A10: Prisma models `CommercialCycle` (`schema.prisma:170-185`) and `Automation` (`:207-233`) stay as-is (naming aligned with `04-domain-model.md:79-109`); tenant isolation via `organizationId` from JWT only (API_GUIDELINES §18), cross-tenant → 404 `AUTOMATION_NOT_FOUND` / `COMMERCIAL_CYCLE_NOT_FOUND` (precedent R-005).
- **Q11: Who can use Automatizaciones v1?** → A11: Reads: all authenticated roles. Writes (cancel): PLATFORM_OWNER, ADMINISTRADOR, GERENTE (HG-1, INFERENCIA; precedent HG-11 of Imports — `015-imports-v1/spec.md:20`). OPERADOR read-only. Automatic cycle creation is system-triggered (event consumer, no role).
- **Q12: How is the automation generated idempotently?** → A12: The consumer checks whether a CommercialCycle already exists for the `purchaseId` (unique, `schema.prisma:173`); if present, the event is a no-op (07:375-379). Cycle creation and the three automations are created in one transaction (CP-002, `04:327-328`).

## 3. User Stories

- **US1 (auto-create on purchase)**: When a purchase is imported (`PurchaseImported`), the system creates one ACTIVE CommercialCycle with three automations (3 days / 6 months / 12 months) scheduled from the purchase date (AU-001, CP-002).
- **US2 (re-purchase cancels old cycle)**: When a customer makes a new purchase before the previous cycle ends, all pending automations of the previous cycle are cancelled and a new cycle starts from the most recent purchase (AU-003).
- **US3 (view cycles)**: As a user, I can list and view commercial cycles with their automations, status, and dates.
- **US4 (view automations)**: As a user, I can list automations (filtered by status/customer/date) and view their detail.
- **US5 (cancel automation)**: As an ADMINISTRADOR/GERENTE/PLATFORM_OWNER, I can cancel a PENDING/SCHEDULED automation (AU-002, AU-004).
- **US6 (audit)**: Every cycle/automation action is audited (AD-003, `03:410`); audit failures never break the flow.
- **US7 (events)**: The module emits CommercialCycleStarted/AutomationCreated and cancel events with traceability payloads (07:172-198, 383-395).
- **US8 (idempotency)**: Replayed `PurchaseImported` events never create duplicate cycles or automations (07:375-379).

## 4. Functional Requirements

- **FR-001**: Consumer `@OnEvent('PurchaseImported')` (`07:164`): loads the purchase by `purchaseId`; if a CommercialCycle already exists for that `purchaseId` → no-op (idempotent, US8, Q12).
- **FR-002**: On first consumption, create in ONE transaction: CommercialCycle (ACTIVE, `startDate = purchaseDate`, `purchaseId`) + three Automation records with `status = SCHEDULED`, `commercialCycleId`, `scheduledDate = purchaseDate + 3d / +6m / +12m` (AU-001, US1, Q5).
- **FR-003**: AU-003 (US2): when a purchase is imported for a customer with an ACTIVE cycle, the existing cycle's PENDING/SCHEDULED automations → CANCELLED, the cycle → CANCELLED (`endDate = now`), then a new ACTIVE cycle + 3 automations are created (transactional; Q6).
- **FR-004**: `GET /commercial-cycles` list: filters `status`, `customerId`, `purchaseId`, `createdFrom`, `createdTo`, pagination page/limit (≤100), sort whitelist (`-createdAt` default); tenant-scoped (US3).
- **FR-005**: `GET /commercial-cycles/{uuid}`: detail including automations; cross-tenant/unknown → 404 `COMMERCIAL_CYCLE_NOT_FOUND` (US3).
- **FR-006**: `GET /automations` list: filters `status`, `commercialCycleId`, `customerId`, `scheduledFrom`, `scheduledTo`, pagination, sort whitelist (`-scheduledDate` default); tenant-scoped (US4).
- **FR-007**: `GET /automations/{uuid}`: detail with cycle/purchase/customer summaries; cross-tenant/unknown → 404 `AUTOMATION_NOT_FOUND` (US4).
- **FR-008**: `POST /automations/{uuid}/cancel`: only PENDING/SCHEDULED → CANCELLED (AU-002, US5); EXECUTED/CANCELLED/PAUSED → 400 (AU-004); unknown/cross-tenant → 404 (Q8).
- **FR-009**: Roles: `@Roles('PLATFORM_OWNER','ADMINISTRADOR','GERENTE')` on POST cancel; GET endpoints open to all authenticated roles (Q11).
- **FR-010**: Tenant: `organizationId` from JWT only (API_GUIDELINES §18); no `organizationId` accepted from body; PLATFORM_OWNER without org context denied for writes (precedent Imports FR-017, HG-12).
- **FR-011**: Audit: `automation.cycle.created`, `automation.cycle.cancelled`, `automation.created`, `automation.cancelled` (module `automations`, outcomes `.success/.failure`) via `AuditIdentityService` (never-throw, HG-1, US6).
- **FR-012**: Events (US7): emit `CommercialCycleStarted`, `AutomationCreated`, `AutomationCancelled`, `CommercialCycleCancelled` with traceability payload (eventId uuid, occurredAt, userId|null, organizationId, module `automations`, state, payload) per 07:383-395; consumers idempotent (07:375-379).
- **FR-013**: Cycle/automation records are never physically deleted; only `deletedAt` soft-delete applies (CP-004, `03:113-117`; `06-database.md:329`).
- **FR-014**: No endpoint creates cycles/automations manually in v1 (creation is event-driven only, US1); POST cancel is the only write endpoint (Q11, HG-1).
- **FR-015**: Dates: ISO 8601 UTC (API_GUIDELINES §20-21); `scheduledDate` reflects the AU-001 cadence (Q5).

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` only from JWT (API_GUIDELINES §18).
- **NR-002**: Envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-003**: No N+1: list endpoints preload related automations/cycles via `include` (single query) or batched loads; cycle detail includes its automations in one query.
- **NR-004**: Transactional invariants: cycle + 3 automations created atomically; AU-003 cancel+recreate atomically (Q6, FR-002/003).
- **NR-005**: Concurrency-safe state transitions (single-row updates guarded by status predicates, precedent Imports NR-010).
- **NR-006**: Idempotent event consumption (07:375-379); no duplicate cycles (unique `purchaseId` backstop, P2002 → treated as no-op, never 500).
- **NR-007**: Audit never-throw (AuditIdentityService pattern, `audit.identity.service.ts:52-64`).
- **NR-008**: Controlled exceptions only; never leak internal errors (Constitution IX).
- **NR-009**: No secrets, credentials or PII in logs.
- **NR-010**: Date filters date-only = whole-day inclusive (purchases precedent, commit dca47bc).

## 6. Acceptance Scenarios

- **AS-001**: `PurchaseImported` for a purchase → one ACTIVE cycle + 3 SCHEDULED automations created with correct dates (US1, FR-002).
- **AS-002**: Same `PurchaseImported` replayed → no-op, no duplicate cycle (US8, FR-001).
- **AS-003**: New purchase for a customer with ACTIVE cycle → previous cycle CANCELLED with endDate set, its PENDING/SCHEDULED automations CANCELLED, new ACTIVE cycle + 3 automations created (US2, FR-003).
- **AS-004**: Cycle detail returns its automations (US3, FR-005).
- **AS-005**: Automation list filtered by status/customer/scheduled dates with pagination (US4, FR-006).
- **AS-006**: Cancel a SCHEDULED automation → 200, status CANCELLED (US5, FR-008).
- **AS-007**: Cancel an EXECUTED/CANCELLED automation → 400 (AU-004, FR-008).
- **AS-008**: Cancel another organization's automation → 404 AUTOMATION_NOT_FOUND (FR-010).
- **AS-009**: OPERADOR cancel → 403; GET list/detail → 200 (Q11, FR-009).
- **AS-010**: No manual create endpoint exists (POST only cancel) (FR-014).
- **AS-011**: Audit rows exist for cycle/automation created/cancelled (FR-011, US6).
- **AS-012**: Events emitted: CommercialCycleStarted + AutomationCreated (×3) with traceability payload (FR-012, US7).
- **AS-013**: Dates in ISO 8601 UTC; scheduledDate = purchaseDate + cadence (FR-015, Q5).
- **AS-014**: `createdFrom`/`createdTo` date-only filters include the whole day (NR-010).

## 7. Out of Scope (v1)

- Execution of automations / message sending (Flujo 05) — HG-1: future WhatsApp/Messages module.
- Scheduler / `@nestjs/schedule` / BullMQ — HG-2 (`08:261,271`).
- AU-006/007/008 (pause by open conversation, advisor notification) — HG-3: future Conversations module (`07:294-303`).
- AU-009 (business hours) — HG-3: future Configuración module.
- AU-010 (max 1 per period + campaign priority) — HG-4: future Campañas module.
- AU-011 (double-send guard) — execution-time, HG-1: future WhatsApp module.
- `AutomationScheduled/Executed/Failed` events — reserved for execution (Q9).
- Manual cycle/automation creation endpoints — HG-1 (FR-014).
- Campaign-driven automations (CA-001..CA-003) — future Campañas module.
- Dashboard indicators on automation events — future consumers.

## 8. Known Conflicts (resolved via HG)

- **C-01** (execution dependency): AU-001 says "toda compra genera automáticamente" the follow-ups (03:177-183) and Flujo 05 describes execution; the WhatsApp/Messages and scheduler modules do not exist. → **HG-1/HG-2**: v1 creates + manages cycles/automations; execution and scheduling deferred.
- **C-02** (AU-006/007 conversation dependency): AU-006 requires conversation state (Abierta/Cerrada) and advisor notification; Conversations module does not exist. → **HG-3**: deferred; PAUSED state and status-predicate extension points prepared.
- **C-03** (AU-009/010 dependencies): business hours (Configuración) and campaign priority (Campañas) modules do not exist. → **HG-3/HG-4**: deferred; `priority` field retained on the model.
- **C-04** (state naming): AU-002 lists five states (Pendiente/Programada/Ejecutada/Cancelada/Error); the Prisma enum adds `PAUSED` (schema.prisma:475-482). → **HG-3**: AU-002 states map to the enum; PAUSED reserved (no conflict, additive).

## 9. Dependency Justification (AGENTS.md)

- `@nestjs/event-emitter` (already installed for Imports, `@nestjs/event-emitter@^3.1.0`): required to consume `PurchaseImported` (`07:164`) and emit cycle/automation events (`07:172-198`). Registered via `EventEmitterModule.forRoot()` (`app.module.ts:27`). No new dependency.
- No scheduler dependency in v1 (HG-2).

## 10. Role and Tenant Notes

- All reads open to every authenticated role (Q11); cancel write restricted to PLATFORM_OWNER/ADMINISTRADOR/GERENTE (precedent Imports HG-11).
- `TenantScopeGuard` MUST NOT be used (precedent R-005); tenant enforcement in the service layer (`findScoped` pattern). Cross-tenant → 404 (never 403/404 ambiguity, precedent).
- Automatic consumption runs in the purchase's organization scope, never cross-tenant.