# Configuraciones v1 — Feature Specification

## 1. Purpose

**Módulo 10 — Configuración** (`specs/02-modules.md:258`) defines Empresa,
WhatsApp, Horarios, Campañas, Plantillas and Parámetros, and **Flujo 11**
(`05-user-flows.md:274`) ends in "Configuración actualizada". None of that is
editable today: the effective configuration lives in installation-wide
environment variables (`apps/api/src/core/config/configuration.ts`), the
organization has no surface to change the values that govern its own
communications, and **AU-009** ("las automatizaciones únicamente podrán
ejecutarse dentro del horario comercial configurado por la empresa") is
deferred because "business hours (Configuración) ... modules do not exist"
(`016-automations-v1` C-03, HG-3).

This delivery implements **Configuración v1 = Empresa + Horarios +
Parámetros**, persisted per organization, resolved as
`BD > env > default del código`. Credentials, SMS channels and user management
stay out, so no secret ever reaches the database.

## 2. Scope

- **Empresa**: edit the organization's own data (nombre, NIT, email, teléfono,
  ciudad). The model already exists (`Organization`); today the module only
  exposes `GET /organizations/:id` and no write at all.
- **Horarios**: business hours and timezone per organization, enforced on
  WhatsApp automation execution (AU-009).
- **Parámetros**: the seven non-sensitive business parameters the code already
  reads, each reported with the origin of its effective value.

## 3. Out of Scope (v1)

- **Credentials and integrations** (`WHATSAPP_API_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, webhook tokens, Pancake, Altiria): they stay in
  `.env`. No secrets in the database, no encryption, no new security model.
  Explicitly deferred to a future delivery (human decision 2026-10-01).
- **`ChannelAccount` (SMS)**: the model exists with no endpoints (SMS Fase 1).
  Its CRUD is a separate front; v1 does not touch `messaging/`.
- **Usuarios, roles e invitaciones**: separate administrative front.
- **Campañas / Plantillas**: already their own modules (019, templates).
- **SMS quiet hours and timezone**: `sms-scheduler.ts` keeps reading the
  environment. Rationale: avoiding two sources of truth for "horarios" across
  two schedulers with different test coverage, and not touching the area that
  carries the open SMS webhook finding. Recorded as a follow-up (C-01).
- **AU-010** (one automation per period defined by the company, resolved with
  campaign priority): stays deferred (HG-4). v1 persists what already works
  (`maxCommercialPer60d`, `minDaysBetweenCommercial`).
- **Platform-level configuration**, configuration caching, and dynamic
  key/value indirection.

## 4. Permissions

`@Roles('PLATFORM_OWNER', 'ADMINISTRADOR')` with `JwtAuthGuard` +
`TenantScopeGuard`, following `invitations.controller.ts`. In v1 both reads and
writes are restricted to those roles; widening reads to `GERENTE` is a
decorator change. Every write takes `organizationId` **exclusively from the
JWT**, never from the request body (012 §6, API_GUIDELINES §18).

## 5. Data Model

One new model, **one row per organization** (`@@unique([organizationId])`),
created lazily on the first write, so the migration is purely additive with no
backfill. Repository convention for authorship: `createdBy`/`updatedBy` as
plain `String?` (no relation), plus `deletedAt` for soft delete.

```prisma
model OrganizationConfig {
  id             String  @id @default(cuid())
  uuid           String  @unique @default(uuid())
  organizationId String  @unique @map("organization_id")

  // Horarios (AU-009)
  businessHoursEnabled Boolean   @default(false) @map("business_hours_enabled")
  timezone             String    @default("America/Bogota")
  businessDays         String[]  @default(["MON", "TUE", "WED", "THU", "FRI"]) @map("business_days")
  businessHoursStart   Int?      @map("business_hours_start") // minutos desde medianoche
  businessHoursEnd     Int?      @map("business_hours_end")

  // Parámetros de negocio (null = sin definir => cae a env/default)
  maxCommercialPer60d           Int?    @map("max_commercial_per_60d")
  minDaysBetweenCommercial      Int?    @map("min_days_between_commercial")
  quoteExpiryDays               Int?    @map("quote_expiry_days")
  whatsappMessageCost           Int?    @map("whatsapp_message_cost")
  whatsappMessageCostCommercial Int?    @map("whatsapp_message_cost_commercial")
  smsCostPerSegment             Int?    @map("sms_cost_per_segment")
  smsCurrency                   String? @map("sms_currency")

  createdBy String?   @map("created_by")
  updatedBy String?   @map("updated_by")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  organization Organization @relation(fields: [organizationId], references: [id])
}
```

Design notes: one column per parameter, never a JSON blob or a dynamic key
table, so each parameter has a declared type, a validation rule and a default
in code. `businessHoursStart`/`End` are **minutes from midnight** (0..1439) so
the UI can express 08:30 and the "next valid slot" arithmetic stays integer.

## 6. Endpoints and precedence

| Method | Route                            | Roles                      | Notes |
|---|---|---|---|
| GET   | `/organizations/me`              | ADMIN, PLATFORM_OWNER      | New. **Declared before `:id`** or the existing route captures it |
| PATCH | `/organizations/me`              | ADMIN, PLATFORM_OWNER      | `name, nit, email, phone, city` |
| GET   | `/configuraciones/horarios`      | ADMIN, PLATFORM_OWNER      | Effective value + `source` per field |
| PATCH | `/configuraciones/horarios`      | ADMIN, PLATFORM_OWNER      | Partial upsert |
| GET   | `/configuraciones/parametros`    | ADMIN, PLATFORM_OWNER      | Effective value + `source` per field |
| PATCH | `/configuraciones/parametros`    | ADMIN, PLATFORM_OWNER      | Partial upsert |
| GET   | `/configuraciones/efectivas`     | ADMIN, PLATFORM_OWNER      | `clave → { valor, source: db \| env \| default }` |

**Precedence** (human decision 2026-10-01), per organization:

```
valor en BD (columna no null)  →  variable de entorno  →  default del código
```

The environment keeps working as the installation and bootstrap fallback.
Every parameter declares its default equal to the value the code uses today,
so a tenant without a configuration row behaves exactly as before:

| Key | Code default | Environment variable today |
|---|---|---|
| `maxCommercialPer60d` | 3 | `JOURNEYS_MAX_COMMERCIAL_PER_60D` |
| `minDaysBetweenCommercial` | 3 | `JOURNEYS_MIN_DAYS_BETWEEN_COMMERCIAL` |
| `quoteExpiryDays` | 7 | `QUOTE_EXPIRY_DAYS` |
| `whatsappMessageCost` | 200 | `WHATSAPP_MESSAGE_COST` |
| `whatsappMessageCostCommercial` | 400 | `WHATSAPP_MESSAGE_COST_COMMERCIAL` |
| `smsCostPerSegment` | 100 | `SMS_COST_PER_SEGMENT` |
| `smsCurrency` | `COP` | `SMS_CURRENCY` |

**No cache in v1**: the row is read per operation. The volume makes it
unnecessary and it removes a whole class of stale-configuration bugs. Recorded
here so nobody "optimizes" it later without thinking.

## 7. Business hours rules (AU-009)

- If `businessHoursEnabled` is `false` (the default) or there is no row, **no
  restriction applies**: behavior is today's. An unconfigured tenant is
  unaffected.
- When enabled, a WhatsApp automation may execute only if `now`, in the
  organization's `timezone`, falls on one of `businessDays` and between
  `businessHoursStart` and `businessHoursEnd`. The window may cross midnight.
- **Outside the window the row is not rescheduled and not mutated**: it is
  skipped and stays `SCHEDULED`, exactly like `SmsScheduler` does today with
  `deferred++`. The next tick inside the window executes it. This satisfies
  "permanecerá en estado Pendiente hasta la siguiente ventana disponible"
  without one write per tick and per automation. The observable difference
  versus rewriting `scheduledDate` is that the stored date remains the original
  one (C-02).
- A skip **does not count a retry** (`retryCount` untouched) and **emits no
  failure** event.
- The rule applies to **every** automation regardless of purpose, including
  `TRANSACTIONAL`: AU-009 does not distinguish purposes. Note that
  `SmsScheduler` currently defers only `COMMERCIAL`, so WhatsApp and SMS will
  differ (C-03).

## 8. Audit and events

Every write records in `AuditIdentityService` (never-throw): module
`configuraciones`, actions `configuration.empresa.updated`,
`configuration.horarios.updated`, `configuration.parametros.updated`, `outcome`
success/failure, `userId` from the JWT, `organizationId`, and in `metadata` the
touched keys. After commit the PATCH handlers emit the new domain event
`OrganizationConfigUpdated` (additive; `07-event-architecture.md:341` mentions
"Actualizar configuración" as a synchronous event but defines no name). It has
no consumer in v1 and is emitted for traceability.

## 9. Non-Functional Requirements

- **NR-001 (tenancy)**: every read and write is scoped by the JWT
  `organizationId`. A body or path carrying another `organizationId` is
  rejected (cross-tenant).
- **NR-002 (validation)**: `businessHoursStart`/`End` in 0..1439,
  `businessDays` a subset of MON..SUN without duplicates, `timezone` a valid
  IANA identifier, `businessHoursEnd != businessHoursStart`, costs and day
  counts positive integers, `smsCurrency` a 3-letter uppercase code.
- **NR-003 (no secrets)**: no endpoint in this module accepts, returns or
  stores an integration credential.
- **NR-004 (audit)**: a failed audit never breaks the write (existing
  NR-007 behavior of `AuditIdentityService`).
- **NR-005 (i18n)**: labels and messages in Spanish; identifiers in English.
- **NR-006 (tests)**: unit tests for precedence and origin reporting, for the
  audit on success and failure, and for the business-hours gate (inside and
  outside the window, wrong weekday, disabled, timezone). Target coverage
  ≥ 80% on the new module.

## 10. Acceptance Scenarios

- **AC-1**: ADMIN changes the company name → it persists, `/organizations/me`
  returns it, and GERENTE gets 403.
- **AC-2**: ADMIN saves Parámetros → `GET /configuraciones/parametros` reports
  the saved keys with `source: "db"`; untouched keys keep their previous source.
- **AC-3**: With no row in the database, `/configuraciones/efectivas` returns
  the defaults with `source: "default"`; with `WHATSAPP_MESSAGE_COST=350` in the
  environment that key reports `source: "env"` and 350.
- **AC-4**: A database value wins over the environment: with
  `QUOTE_EXPIRY_DAYS=14` and `quoteExpiryDays=7` in the database, a quote
  expires after 7 days.
- **AC-5**: Business hours active (MON-FRI, 08:00-18:00, America/Bogota): an
  automation scheduled at 22:00 does not execute, stays `SCHEDULED` with
  `retryCount` 0, and executes on the first tick inside the window.
- **AC-6**: Business hours active: nothing executes on a Saturday even at
  10:00.
- **AC-7**: `businessHoursEnabled: false`: an automation at 22:00 executes as
  today.
- **AC-8**: Every write leaves an audit row and an
  `OrganizationConfigUpdated` event.
- **AC-9**: A `PATCH` carrying an `organizationId` different from the JWT is
  rejected.
- **AC-10**: `PATCH /organizations/me` cannot change `slug` or `status`.
- **AC-11**: An invalid payload (end before start, unknown weekday, 1500
  minutes) is rejected with `VALIDATION_ERROR` and writes nothing.

## 11. Impact on existing modules

| Module | Point | Change |
|---|---|---|
| `organizations` | `GET :id` only | Add `me` **before** `:id`, plus `PATCH me`; reuses `TenantScopeGuard` |
| `campaigns` | `commercialAllowed` (`campaigns.service.ts:1916-1919`) | Read the anti-spam values through the organization's effective config |
| `campaigns` | `previewSegment` / `previewSegmentDraft` (`campaigns.service.ts:1243` and the two `messageCost` sites) | Read costs per organization |
| `quotes` | `quotes.service.ts:281` | Read `quoteExpiryDays` per organization |
| `whatsapp` | `executeDueAutomations` | New business-hours gate before sending, same shape as `SmsScheduler` |
| `messaging` (SMS) | `sms-scheduler.ts:89-93` | **Not touched** |
| `core/config` | `configuration.ts` | **Not touched**: it remains the installation fallback |

## 12. Known Conflicts / Decisions Pending

- **C-01 (SMS quiet hours stay on the environment)**: with Horarios persisted
  per organization, `sms.commercialQuietHoursStart/End` and `sms.timezone` are
  the only "horarios" still environment-driven. Two sources of truth for the
  same concept. Deferred on purpose (§3) and to be unified when the SMS channel
  CRUD front opens.
- **C-02 (skip versus rewrite)**: AU-009 is implemented as "skip and stay
  SCHEDULED". Rewriting `scheduledDate` to the next valid slot would make the
  stored date match the promise literally at the cost of one write per skipped
  automation. Both satisfy the rule; the current choice avoids the write.
- **C-03 (purpose scope)**: AU-009 is applied literally to every automation,
  including `TRANSACTIONAL`, while `SmsScheduler` defers only `COMMERCIAL`. The
  specs do not reconcile the two; if transactional messages should bypass
  business hours, both schedulers must change together.

## 13. Deliverable boundary

This delivery exists for the Baterías del Caribe handover. It is not a
generalization of the platform: one row per organization, no platform-level
configuration, no key indirection, no cache, no multi-tenant generalization
ahead of time. Only what the administrator of one organization needs to
configure it end to end.