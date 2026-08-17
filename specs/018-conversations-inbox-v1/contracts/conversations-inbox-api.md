# Conversations Inbox v1 — API Contract (contract-first)

Base path: `/api/v1/conversations`, `/api/v1/conversation-tags`, `/api/v1/quick-replies`. All REST responses use the standard envelope `{ data }`, `{ data, meta }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). All REST endpoints require `Authorization: Bearer <JWT>`.

This contract **extends** the kit 017 contract (`specs/017-whatsapp-v1/contracts/whatsapp-api.md`): the shapes below add the inbox fields; existing 017 shapes are unchanged.

## Shared shapes

```ts
interface AdvisorRef {
  uuid: string;
  firstName: string;
  lastName: string;
}

interface ConversationTagRef {
  uuid: string;
  name: string;
  color: string | null;    // hex, e.g. "#0EA5E9"
}

interface ConversationNoteSummary {
  uuid: string;
  author: { uuid: string; firstName: string; lastName: string };
  content: string;
  createdAt: string;       // ISO 8601 UTC
}

// ConversationSummary (017) extended with:
//   advisor: AdvisorRef | null
//   tags: ConversationTagRef[]          // active assignments (FR-006)

// ConversationDetail (017) extended with:
//   notes: ConversationNoteSummary[]    // append-only log (FR-007)

interface ConversationTagSummary {
  uuid: string;
  name: string;
  color: string | null;
  conversationCount: number;            // active assignments (soft-delete excluded)
  createdAt: string;
  updatedAt: string;
}

interface ConversationTagDetail extends ConversationTagSummary {}

interface QuickReplySummary {
  uuid: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface QuickReplyDetail extends QuickReplySummary {}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
```

Internal fields (`organizationId`, relation rows, provider ids) are NOT exposed beyond these shapes (API_GUIDELINES §6-8).

## GET /conversations — bandeja (list, extended)

- Roles: all authenticated
- New query params (in addition to 017): `assigned` (`true|false` — has/has-not `advisorId`), `tagIds` (comma-separated tag uuids, any-of), `status` (OPEN|CLOSED|ARCHIVED), existing 017 filters (`channel`, `customerId`, `advisorId`, `createdFrom`/`createdTo` date-only inclusive, `page`, `limit` ≤100, `sort` whitelist unchanged: `-createdAt` default, `createdAt`, `updatedAt`, `status`)
- Row shape: `ConversationSummary` extended with `advisor: AdvisorRef | null`, `tags: ConversationTagRef[]` (preloaded, no N+1)
- Tenant-scoped via `organizationId`; cross-tenant rows never returned

200 OK:

```json
{ "data": [ /* ConversationSummary[] (extended) */ ], "meta": { "page": 1, "limit": 20, "total": 2, "pages": 1 } }
```

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`.

## GET /conversations/{uuid} — detail (extended)

- Roles: all authenticated
- `ConversationDetail` extended with `notes: ConversationNoteSummary[]`; `messages` unchanged (one query, no N+1, NR-003)
- Cross-tenant or unknown → `404 CONVERSATION_NOT_FOUND`

200 OK:

```json
{ "data": { /* ConversationDetail (extended) */ } }
```

Errors: `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## POST /conversations/{uuid}/messages — asesor reply

- Roles: all authenticated, including OPERADOR (HG-5)
- Header: `Idempotency-Key` (API_GUIDELINES §19)
- Body:

```json
{
  "content": "Hola …",            // required, 1..4096 chars
  "quickReplyId": "…"             // optional, quick-reply uuid (audit reference, FR-008)
}
```

- Behavior: create OUTBOUND `type=OUTGOING` Message (the 017-reserved type, HG-6), persist QUEUED, call provider after commit, update QUEUED → SENT/FAILED (017 FR-003/FR-004 precedent), emit `MessageQueued`/`MessageSent`/`MessageFailed`, audit `message.send`.
- **Reopen**: if the conversation is `CLOSED`, reply transitions it to `OPEN` atomically with the message creation (NR-004).
- **Archived**: if `ARCHIVED` → `400 VALIDATION_ERROR` (explicit reopen first, HG-5). Cross-tenant/unknown → `404 CONVERSATION_NOT_FOUND`.
- `quickReplyId` must belong to the tenant → else `404 QUICK_REPLY_NOT_FOUND`.
- Provider outage → `502 PROVIDER_ERROR` (message persisted as FAILED).

201 Created:

```json
{ "data": { "uuid": "…", "status": "SENT", "direction": "OUTBOUND", "type": "OUTGOING", "conversationId": "…", "createdAt": "…" } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`, `404 QUICK_REPLY_NOT_FOUND`, `502 PROVIDER_ERROR`, `409` (duplicate Idempotency-Key in-flight). A customer without a phone (linked conversation customer with null phone) → `400 VALIDATION_ERROR` (same guard as manual sends).

## POST /conversations/{uuid}/assign — assign advisor

- Roles: all authenticated (HG-4)
- Body: `{ "advisorId": "…" }` (required, user uuid)
- Validations: conversation exists in tenant → else `404 CONVERSATION_NOT_FOUND`; advisor is a user of the conversation's organization → else `400 VALIDATION_ERROR`; advisor disabled → `400 VALIDATION_ERROR`
- Behavior: set `Conversation.advisorId`; assigning the same advisor is a no-op (no event); otherwise emit `ConversationAssigned` (conversationId, advisorId, assignedBy), audit `conversation.assign`. Does not change state (Q2).

200 OK:

```json
{ "data": { "uuid": "…", "advisor": { "uuid": "…", "firstName": "…", "lastName": "…" } } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## POST /conversations/{uuid}/transfer — transfer advisor

- Roles: all authenticated (HG-4)
- Body: `{ "advisorId": "…" }` (required, new advisor uuid)
- Same validations as assign; current advisor must differ from target → else no-op `200` (same advisor).
- Behavior: set `Conversation.advisorId`, emit `ConversationTransferred` (conversationId, fromAdvisorId, toAdvisorId, transferredBy), audit `conversation.transfer`.

200 OK: same shape as assign.

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## POST /conversations/{uuid}/close — close

- Roles: all authenticated (HG-5)
- Guards: `OPEN → CLOSED` (single-row guarded update, NR-005); closing an already non-OPEN conversation → `400 VALIDATION_ERROR`
- Emit `ConversationClosed` (conversationId, closedBy, changedAt), audit `conversation.close`.

200 OK:

```json
{ "data": { "uuid": "…", "status": "CLOSED" } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## POST /conversations/{uuid}/archive — archive

- Roles: all authenticated (HG-5)
- Guards: `OPEN → ARCHIVED`, `CLOSED → ARCHIVED`; archiving an ARCHIVED conversation → `400 VALIDATION_ERROR`
- Emit `ConversationArchived` (conversationId, archivedBy, changedAt), audit `conversation.archive`.

Errors: as close.

## POST /conversations/{uuid}/reopen — reopen

- Roles: all authenticated (HG-5)
- Guards: `CLOSED → OPEN`, `ARCHIVED → OPEN`; reopening an OPEN conversation → `400 VALIDATION_ERROR`
- Emit `ConversationOpened`?? — NO: `ConversationOpened` is emitted by the whatsapp module only for inbound first-message (Q3). Reopen emits no event in v1 (status change only); audit `conversation.reopen`.

Errors: as close.

## POST /conversations/{uuid}/notes — add note (append-only)

- Roles: all authenticated
- Body: `{ "content": "…" }` (required, 1..4000 chars)
- Cross-tenant/unknown → `404 CONVERSATION_NOT_FOUND`. Append-only (HG-2): no update/delete endpoints in v1.

201 Created:

```json
{ "data": { "uuid": "…", "author": { "uuid": "…", "firstName": "…", "lastName": "…" }, "content": "…", "createdAt": "…" } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## GET /conversations/{uuid}/notes — list notes

- Roles: all authenticated
- Returns `ConversationNoteSummary[]` ordered by `createdAt` ascending (log order)
- Cross-tenant/unknown → `404 CONVERSATION_NOT_FOUND`

Errors: as add note.

## POST /conversations/{uuid}/tags/{tagUuid} — assign tag

- Roles: all authenticated (HG-1)
- Validations: conversation in tenant → else `404 CONVERSATION_NOT_FOUND`; tag in tenant → else `404 TAG_NOT_FOUND`; already assigned → no-op `200` (never error)
- Behavior: create `ConversationTagAssignment` (unique `(conversationId, tagId)` backstop, P2002 → no-op), audit `conversation.tag.assign`.

200 OK:

```json
{ "data": { "uuid": "…", "tags": [ /* ConversationTagRef[] */ ] } }
```

Errors: `400`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`, `404 TAG_NOT_FOUND`.

## DELETE /conversations/{uuid}/tags/{tagUuid} — remove tag

- Roles: all authenticated
- Behavior: soft-delete the active assignment (or no-op if not assigned), audit `conversation.tag.remove`.

200 OK: same shape as assign.

Errors: `400`, `401`, `403`, `404 CONVERSATION_NOT_FOUND`, `404 TAG_NOT_FOUND`.

## GET /conversation-tags — list catalog

- Roles: all authenticated
- Query: `page`, `limit` (≤100), `sort` (whitelist: `-createdAt` default, `name`, `conversationCount`), optional `name` (starts-with, case-insensitive)
- Tenant-scoped; returns `ConversationTagSummary[]`

Errors: `401`, `403`.

## POST /conversation-tags — create tag

- Roles: ADMINISTRADOR, GERENTE (HG-1)
- Body: `{ "name": "…" (required, 1..50), "color": "…" (optional, hex #RRGGBB) }`
- Unique name per organization → duplicate → `409 TAG_NAME_EXISTS`

201 Created: `{ "data": { /* ConversationTagDetail */ } }`

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `409 TAG_NAME_EXISTS`.

## PATCH /conversation-tags/{uuid} — update tag

- Roles: ADMINISTRADOR, GERENTE
- Body: `{ "name"?: "…", "color"?: "…" }` (at least one field)
- Cross-tenant/unknown → `404 TAG_NOT_FOUND`; duplicate name → `409 TAG_NAME_EXISTS`

Errors: as create + `404 TAG_NOT_FOUND`.

## DELETE /conversation-tags/{uuid} — delete tag (soft)

- Roles: ADMINISTRADOR, GERENTE
- Behavior: soft-delete tag + its active assignments (CO-003, FR-011); already deleted → no-op `200`
- Cross-tenant/unknown → `404 TAG_NOT_FOUND`

200 OK: `{ "data": { "uuid": "…", "deleted": true } }`

Errors: `401`, `403`, `404 TAG_NOT_FOUND`.

## GET /quick-replies — list

- Roles: all authenticated
- Query: `page`, `limit` (≤100), `sort` (whitelist: `-createdAt` default, `title`), optional `title` (starts-with, case-insensitive)
- Tenant-scoped; returns `QuickReplySummary[]`

Errors: `401`, `403`.

## POST /quick-replies — create

- Roles: ADMINISTRADOR, GERENTE (HG-3)
- Body: `{ "title": "…" (required, 1..100), "body": "…" (required, 1..4096) }`

201 Created: `{ "data": { /* QuickReplyDetail */ } }`

Errors: `400 VALIDATION_ERROR`, `401`, `403`.

## PATCH /quick-replies/{uuid} — update

- Roles: ADMINISTRADOR, GERENTE
- Body: `{ "title"?: "…", "body"?: "…" }` (at least one field)
- Cross-tenant/unknown → `404 QUICK_REPLY_NOT_FOUND`

Errors: as create + `404 QUICK_REPLY_NOT_FOUND`.

## DELETE /quick-replies/{uuid} — delete (soft)

- Roles: ADMINISTRADOR, GERENTE
- Behavior: soft-delete (CO-003); already deleted → no-op `200`
- Cross-tenant/unknown → `404 QUICK_REPLY_NOT_FOUND`

200 OK: `{ "data": { "uuid": "…", "deleted": true } }`

Errors: `401`, `403`, `404 QUICK_REPLY_NOT_FOUND`.

## Error codes (controlled exceptions)

`CONVERSATION_NOT_FOUND` (404), `TAG_NOT_FOUND` (404), `QUICK_REPLY_NOT_FOUND` (404), `VALIDATION_ERROR` (400), `TAG_NAME_EXISTS` (409), `FORBIDDEN` (403), `UNAUTHORIZED` (401), `PROVIDER_ERROR` (502). Never leak internals (Constitution IX).

## OpenAPI wiring

Paths `specs/api/paths/conversations.yaml` (extended: bandeja filters, reply, assign/transfer, lifecycle, notes and tags sub-paths) + new `conversation-tags.yaml` and `quick-replies.yaml`; new schemas `ConversationTag`, `ConversationNote`, `QuickReply` (Summary/Details/ListResponse/Response each), `ConversationTagRef`, `ConversationNoteSummary`, `CreateConversationTagRequest`, `UpdateConversationTagRequest`, `CreateConversationNoteRequest`, `CreateQuickReplyRequest`, `UpdateQuickReplyRequest`, `AssignConversationRequest`, `ReplyConversationRequest`; tags `Conversation Tags`, `Quick Replies` in `info/tags.yaml`; `npm run api:validate` green. The 017 `/conversations` GET shapes gain the new fields (no breaking change — additive).