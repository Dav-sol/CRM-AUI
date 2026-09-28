# Filtros v1 — Feature Specification

## 1. Purpose

Filtering is the highest-frequency interaction of a post-sale CRM: an advisor
opens Clientes, asks "who has a battery about to expire in my city?", works
that list, then jumps to Automations or Campañas and asks the same question
with different words. Today the platform has **three unrelated filter
mechanisms** and no specification:

- `apps/web/src/lib/filter-provider.tsx` + `components/filters/global-filter.tsx`
  (untracked WIP): a global filter in the header, persisted in
  `localStorage["automatizeit-filters"]`, that **no screen reads**. Its badge
  counts active filters while the lists keep showing unfiltered data.
- `apps/web/src/lib/use-list-query.ts`: filters in the URL query string,
  used by **Clientes** and **Automatizaciones** only.
- Local `useState` in the other 10 list screens: **lost** on navigation,
  reload or back/forward.

This spec defines one filter model for the whole web app: which dimensions
exist, which screen exposes each one, how a filter is *applied* (draft →
Aplicar), where it is *cached* (URL + localStorage/sessionStorage) and what it
means for the API that already supports most of it.

**Out of scope for v1**: any new API parameter. Every filter in this spec maps
to a query parameter that `specs/api` already declares and the SDK already
types (FR-002 inventory). Anything that would need a contract change is listed
in §7.

## 2. Clarifications (Q&A)

- **Q1: One global filter or per-list filters?** → A1: **Both, with one
  catalogue.** A global filter in the header holds the *commercial* dimensions
  that make sense across screens (city, warranty status, product/category,
  date range). Each list additionally exposes its *own* dimensions (status,
  purpose, purpose-specific ids). A screen applies the global dimensions that
  its endpoint supports plus its own; the badge counts only what is actually
  sent to that screen. Rationale: the WIP global filter already exists and is
  invisible, so the highest-value fix is to wire it, not to replace it.

- **Q2: What does "aplicar" mean — instant or explicit?** → A2 (human decision
  2026-09-27): **explicit, on every screen, with instant search.** Changing a
  control updates a *draft* and issues **no** request. `Aplicar filtros`
  commits the draft (one request) and closes the panel; `Limpiar` resets the
  draft to the applied value; closing the panel **discards** the draft. Search
  and date typing are the exceptions: they are debounced (300 ms) and applied
  automatically, because waiting for a button to type a customer name is
  hostile. Pagination and sort apply immediately (they are not filters).

- **Q3: Do filters survive a page reload, a tab change and logging out?**
  → A3 (human decision 2026-09-27): **yes in all three cases.**
  - *Reload / back-forward / share link*: the URL is the source of truth
    (FR-004).
  - *Tab change*: the URL travels with the link, so filters survive
    navigation; the global filter is additionally kept in `localStorage`.
  - *Logout*: **the global filter is NOT cleared** — the next user of that
    browser starts with the last applied filters. This is a deliberate UI
    convenience, not a data boundary: every query keeps taking
    `organizationId` from the JWT, so a filter can never leak another
    tenant's rows (NR-003). The consequence to accept: the first screen a new
    user opens may be filtered, and the badge makes that visible.

- **Q4: How are filters cached per screen?** → A4: two layers, no third.
  1. **URL** (`?city=…&warrantyStatus=expiring&page=1`): survives reload,
     back/forward, and is shareable.
  2. **`sessionStorage`**, one entry per screen key (`filters:customers`): used
     **only** when the URL carries no filter for that screen, so opening
     Clientes from the sidebar after having filtered Purchases restores what
     was last applied there. Cleared when the tab closes.

- **Q5: Does the global filter merge with the list's own filters?** → A5: yes,
  and the merge is the intersection (AND) of both sets. A dimension owned by
  the global filter cannot be set locally on that screen (it is shown as
  read-only in the toolbar, with a hint pointing to the header filter), so the
  user never edits the same dimension in two places and gets an ambiguous
  result. Screens whose endpoint does not support a global dimension simply
  ignore it and the badge excludes it (FR-003).

- **Q6: What exactly is "Por vencer" and "Vencida"?** → A6 (human decision
  2026-09-27):
  - `Por vencer` = `warrantyExpiringInDays=30`: the purchase's
    `warrantyExpiresAt` falls in `[now, now + 30 days]`.
  - `Vencida` = `warrantyExpiredInDays=730`: the warranty expired in the last
    **2 years** (`[now - 730 days, now]`). Guarantees that expired earlier are
    **not** returned; the dimension is bounded on purpose so "vencida" stays an
    actionable commercial list rather than a full archive. Both bounds are
    inside the API's own limits (`warrantyExpiringInDays` 1..730,
    `warrantyExpiredInDays` 1..1825), so no contract change is needed.
  - `Con garantía` is the complement: it is **not** a new parameter, it is
    `hasPurchases` + the absence of a warranty filter… **unresolved, see C-01**.

- **Q7: Which screens get which dimensions?** → A7: see §3. The catalogue has
  at most **four visible controls per screen**; anything beyond that lives
  under `Más filtros` so the toolbar never becomes a wall of selects
  (human decision 2026-09-27: "no queremos 200 filtros").

- **Q8: May a dimension be hardcoded to a value list?** → A8: no hardcoded
  value lists for data-derived dimensions. Cities and categories come from the
  API when an endpoint exists (products `category`); the customer city filter
  is a free-text `contains` filter, matching 012 FR-003 and the backend
  implementation (`mode: 'insensitive'`), so no city endpoint is required. The
  hardcoded `CITIES`/`Duncan|MAC|MAC GOLD` arrays in the WIP
  `global-filter.tsx` are removed (C-03).

## 3. Filter catalogue by screen

Only parameters that `specs/api` already declares are listed. "Global" marks the
dimensions owned by the header filter; "Local" marks the ones a screen owns.

| Screen | Global dimensions applied | Local dimensions | Endpoint params used |
|---|---|---|---|
| Clientes | city, warrantyStatus, dateFrom/dateTo (created) | status, sort, search | `city`, `warrantyExpiringInDays`, `warrantyExpiredInDays`, `status`, `createdFrom`, `createdTo`, `search`, `sort` |
| Compras | dateFrom/dateTo (purchaseDate), productCategory→`productId` | status, customerId, search, sort | `dateFrom`, `dateTo`, `productId`, `status`, `customerId`, `search`, `sort` |
| Productos | productCategory→`category` | status, search, sort | `category`, `status`, `search`, `sort` |
| Automatizaciones | dateFrom/dateTo (scheduledDate) | status, purpose, campaignId, customerId, search, sort | `scheduledFrom`, `scheduledTo`, `status`, `purpose`, `campaignId`, `customerId`, `search`, `sort` |
| Campañas | dateFrom/dateTo (created) | status, type, search, sort | `createdFrom`, `createdTo`, `status`, `type`, `search`, `sort` |
| Conversaciones | dateFrom/dateTo, — | status, channel, assigned, advisorId, customerId, search, sort | `createdFrom`, `createdTo`, `status`, `channel`, `assigned`, `advisorId`, `customerId`, `name`, `sort` |
| Mensajes | dateFrom/dateTo | status, direction, conversationId, sort | `createdFrom`, `createdTo`, `status`, `direction`, `conversationId`, `sort` |
| Importaciones | dateFrom/dateTo | status, type, search, sort | `createdFrom`, `createdTo`, `status`, `type`, `search`, `sort` |
| Seguimientos | — | warrantyMonths, search, sort | `warrantyMonths`, `search`, `sort` |
| Biblioteca (plantillas) | — | category, group, search, sort | `category`, `group`, `search`, `sort` |
| Cotizaciones | — | status, customerId, conversationId | `status`, `customerId`, `conversationId` |
| Reportes | dateFrom/dateTo | groupBy, search | `from`, `to`, `groupBy`, `search` |

`productCategory` is a **global** dimension whose value is resolved per screen:
`category` (string) on Productos, `productId` (uuid) on Compras — Compras needs
the product picker, so the header filter exposes the category and the Compras
screen resolves it to ids through the products endpoint (FR-006).

## 4. User Stories

- **US1 (P1) — As an advisor I filter Clientes by city and warranty state and
  get a short, correct list.** Covered by FR-003/FR-005/FR-006.
- **US2 (P1) — As an advisor I move between screens and my filters stay
  applied.** Covered by FR-004/FR-005.
- **US3 (P1) — As an advisor I change several filters and press one button
  instead of watching the list reload four times.** Covered by FR-005.
- **US4 (P2) — As an advisor I share a filtered view with a colleague by
  copying the URL.** Covered by FR-004.
- **US5 (P2) — As an advisor I reload or come back tomorrow and the screen is
  still filtered the way I left it.** Covered by FR-004/FR-005.
- **US6 (P2) — As a platform owner I open a screen and immediately see which
  filters are narrowing it, and how to remove them.** Covered by FR-007.

## 5. Functional Requirements

- **FR-001 (catalogue)**: A single catalogue module describes every dimension
  (id, label, scope `global|local`, API parameter, value type, the screens it
  applies to, the sort of control). Screens and the header filter render from
  it; no screen hardcodes its own filter list. Adding a dimension is one entry,
  not a change in twelve screens.
- **FR-002 (no new contract)**: Every dimension in §3 maps to a parameter that
  `specs/api` already declares. A dimension with no existing parameter is not
  implemented in v1 (§7).
- **FR-003 (applicability)**: A screen sends the global dimensions its endpoint
  accepts and ignores the rest. The badge on a screen counts only the filters
  that screen actually sent, so it can never claim a filter that is not
  narrowing the list. An ignored global dimension is not shown on that screen.
- **FR-004 (URL is the source of truth)**: The applied filters of a screen are
  serialised in the query string, including the global ones, and restored from
  it on mount, on back/forward and on reload. Unknown query params are
  preserved (existing `useListQuery` behavior). Changing any filter resets
  `page` to 1 (existing behavior).
- **FR-005 (draft → Aplicar)**: Each screen owns a draft copy of its filters.
  Selects, radio groups and date pickers edit the draft only. `Aplicar filtros`
  commits it, which is the only event that triggers a data request for those
  dimensions. Closing the panel without applying discards the draft. `Limpiar`
  clears the screen's filters (global included) and requests once. Search inputs
  and date typing are debounced 300 ms and applied automatically.
- **FR-006 (cache)**: Per FR-004, plus: when the URL of a screen carries no
  filter for that screen, the last applied filters of that screen are restored
  from `sessionStorage[filters:<screen>]`; the global filter is mirrored in
  `localStorage["automatizeit-filters"]` (shape versioned, unknown keys
  ignored, malformed JSON ignored). The global filter is **not** cleared on
  logout (Q3).
- **FR-007 (visibility)**: The active-filter count and the individual applied
  filters are visible on the screen that applies them, with one action to
  remove all of them. A filter that is applied but not supported by the current
  screen is never displayed there.
- **FR-008 (no stale drafts)**: Switching screen or applying invalidates the
  previous screen's draft; a draft older than the applied state cannot be
  committed silently — `Aplicar` always commits what the panel shows.
- **FR-009 (fixes the WIP defects)**: The untracked `filter-provider.tsx` /
  `global-filter.tsx` are replaced by the FR-001 catalogue implementation:
  (a) the filter is actually read by the screens, (b) `dateFrom`/`dateTo` stop
  being counted in the badge without any control to set them, (c) the hardcoded
  `CITIES` and category arrays are removed (Q8), (d) a `storage` listener keeps
  two tabs of the same browser consistent, (e) the provider re-reads
  `localStorage` on mount instead of only on first render.
- **FR-010 (fixes `useListQuery`)**: The initial state is no longer memoized
  once (`useMemo(..., [])`), so a query string that changes after mount
  (back/forward, in-app link with filters) is re-read. The current code reads
  the URL only on the first render.

## 6. Non-Functional Requirements

- **NR-001 (requests)**: One applied change produces **one** list request.
  Debounced search produces at most one request per 300 ms of inactivity. No
  request is issued while the user is still editing the draft.
- **NR-002 (performance)**: Filter panels render from the catalogue; the client
  does no client-side filtering of already paginated data (the API filters).
- **NR-003 (tenancy)**: Filters are UI state only. `organizationId` comes from
  the JWT exclusively; no filter value can widen a query beyond the caller's
  organization (012 §6, 013 §6, API_GUIDELINES §18). Cached filters in
  `localStorage`/`sessionStorage` never cross the API boundary.
- **NR-004 (accessibility)**: Each control has a label and an `aria-label`; the
  active count is announced; keyboard focus returns to the trigger after
  applying (existing `ListToolbar` conventions).
- **NR-005 (i18n)**: Labels and messages in Spanish (AGENTS.md); parameter names
  in English.
- **NR-006 (tests)**: Unit tests for the catalogue, the draft/apply state
  machine, the `sessionStorage`/`localStorage` round-trip and the debounce; one
  integration test per screen asserting the request the applied filters produce.
  Target coverage ≥ 80% on the new modules.

## 7. Out of Scope (v1)

- **"Por vencer" as a derived filter over customers** (`Con garantía` needs
  either a new parameter or a composition the API does not offer) — see C-01.
- **A `category`/product filter on Clientes** (the customers endpoint has no
  product/category parameter). It would need a contract change (012 FR-003).
- **Server-side saved filter sets** ("mis filtros"), filter presets in the URL
  as a first-class concept, and sharing filters between users.
- **Column-level filters** (e.g. "stage contains X" free text per column).
- **Changing any API contract**: if a later iteration needs one, it updates
  `specs/012`/`013`/etc. and regenerates the SDK in a separate change.

## 8. Known Conflicts / Decisions Pending

- **C-01 (`Con garantía` is undefined)**: The WIP global filter offers
  "Con garantía" (`active`), but the customers endpoint has no
  "has a valid warranty" parameter: `warrantyExpiringInDays` and
  `warrantyExpiredInDays` are windows, and `hasPurchases` is about purchases,
  not warranty. Implementing it faithfully needs a new parameter (contract
  change) or a composition that would over-fetch. → **Decision (human,
  2026-09-27): the option is not offered.** The global filter ships
  `Todas` / `Por vencer` / `Vencida`, which map exactly to the two windows the
  API declares, and no "Con garantía" is approximated. *(Not invented here on
  purpose — AGENTS.md.)*
- **C-02 (draft discarded vs applied on navigation)**: FR-005 says closing the
  panel discards the draft. If a user changes a filter and then clicks another
  screen without pressing `Aplicar`, the change is lost silently. Alternative:
  keep the draft per screen and mark it "sin aplicar". **Decision required.**
- **C-03 (source of truth for categories)**: the header filter had a hardcoded
  `Duncan | MAC | MAC GOLD` list, and two of those three values do not exist in
  the catalog (the tenant data holds `MAC` and `WILLARD`). The products
  endpoint filters `category` by exact match and there is no categories
  resource, so the UI had no reliable source. → **Decision (human, 2026-09-27):
  do not derive the list from products and do not invent one.** The source of
  truth is defined as a tenant-scoped resource derived from the catalog —
  `GET /api/v1/products/categories` → the distinct non-empty `category` values of
  the caller organization — with no cap and the same tenant isolation as the
  rest of the API. It requires its own change in `specs/014-products-v1` plus
  OpenAPI and the SDK. **Until that exists, the Categoría dimension is not part
  of the global filter in v1** (it stays editable in the product form and
  filterable on the products screen).
- **C-04 (the `warrantyStatus` criterion in the WIP `segment-builder`)**: The
  uncommitted `segment-builder.tsx` replaces the campaign segment criteria
  (`purchaseFrom/purchaseTo/customerStatus/warrantyExpiresFrom/warrantyMonths`)
  with a `warrantyStatus` value that **the campaigns segment API does not
  accept** (019 Q5: `city`, `productId`, `purchaseFrom`, `purchaseTo`,
  `customerStatus`). It was kept out of the SMS commit. It must be either
  reverted or backed by a contract change; it is unrelated to this feature.
- **C-05 (conversation lookup per customer row)**: the customers list resolves a
  "open conversation" shortcut per row, and the conversations endpoint filters by
  a single `customerId`, so the list issues one request per customer with a
  phone. They are issued in parallel and resolved in a single state update, and
  the customer list row carries no conversation field. The reliable fix is to
  include it in the list response (`conversationUuid` or `hasConversation`),
  which changes the 012 contract, the OpenAPI and the SDK. Until then the
  parallel per-row lookup stands.

## 9. Acceptance Scenarios

- **AS-001**: Clientes → header filter → city `Medellín` + `Por vencer` →
  `Aplicar filtros` → exactly one request `?city=medell%C3%ADn&warrantyExpiringInDays=30`
  → the badge shows 2 → reload → the same URL and the same list.
- **AS-002**: Clientes with those filters → sidebar → Automatizaciones → the
  date range is applied (its endpoint accepts dates) and the city/warranty
  dimensions are not sent and not shown.
- **AS-003**: Compras with no filters in the URL → the `sessionStorage` entry
  from the last visit is restored and marked as such; pressing `Limpiar` clears
  both the URL and the entry.
- **AS-004**: Change a select, do not press `Aplicar`, close the panel → the
  list is unchanged; reopen → the previous applied value is shown.
- **AS-005**: Two tabs of the same browser → applying the city filter in one
  updates the other tab's global filter and badge without a reload.
- **AS-006**: Log out and back in → the global filter is still applied
  (Q3) and the data shown is still the caller's organization only.
- **AS-007**: Type three characters in the search box of Clientes → one
  request after 300 ms, `page=1`.
- **AS-008**: Back/forward between two filtered URLs of the same screen → the
  list follows the URL (FR-010).
