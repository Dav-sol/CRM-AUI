# WhatsApp/Messaging v1 — API Contract (contract-first)

Base path: `/api/v1/conversations`, `/api/v1/messages` and `/api/v1/webhooks/whatsapp`. All REST responses use the standard envelope `{ data }`, `{ data, meta }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). REST endpoints require `Authorization: Bearer <JWT>`; the webhook endpoint is public and provider-authenticated (R-017, HG-4).

## Shared shapes

```ts
type ChannelType = 'WHATSAPP_CLIENTS' | 'WHATSAPP_SOCIAL';
type ConversationStatus = 'OPEN' | 'CLOSED' | 'ARCHIVED';
type MessageType = 'AUTOMATIC' | 'MANUAL' | 'INCOMING' | 'OUTGOING';
type MessageDirection = 'INBOUND' | 'OUTBOUND';
type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

interface ConversationSummary {
  uuid: string;
  channel: ChannelType;
  status: ConversationStatus;
  customerId: string | null;        // HG-8
  advisorId: string | null;
  lastMessageAt: string | null;     // createdAt of most recent message
  messageCount: number;             // count in the conversation
  createdAt: string;                // ISO 8601 UTC
}

interface ConversationDetail extends ConversationSummary {
  messages: MessageSummary[];
}

interface MessageSummary {
  uuid: string;
  conversationId: string;           // conversation uuid
  automationId: string | null;      // set for automatic messages
  type: MessageType;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface MessageDetail extends MessageSummary {
  customer: { uuid: string; name: string; phone: string | null } | null;
}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
```

Internal fields (`organizationId`, provider ids, full relations) are NOT exposed beyond these shapes (NR-006/API_GUIDELINES §6-8).

## GET /conversations — list conversations

- Roles: all authenticated (HG-11)
- Query: `page` (default 1), `limit` (default 20, max 100), `status` (OPEN|CLOSED|ARCHIVED), `channel` (WHATSAPP_CLIENTS|WHATSAPP_SOCIAL), `customerId` (customer uuid), `advisorId` (user uuid), `createdFrom` (date-only, inclusive whole day), `createdTo` (inclusive), `sort` (whitelist: `-createdAt` default, `createdAt`, `updatedAt`, `status`, with optional `-` prefix)
- Tenant-scoped via `organizationId` (R-005); cross-tenant rows never returned

200 OK:

```json
{ "data": [ /* ConversationSummary[] */ ], "meta": { "page": 1, "limit": 20, "total": 2, "pages": 1 } }
```

Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`.

## GET /conversations/{uuid} — conversation detail (history)

- Roles: all authenticated
- Returns the conversation with its full message history in one query (FR-008, NR-003, CO-004)
- Cross-tenant or unknown → `404 CONVERSATION_NOT_FOUND`

200 OK:

```json
{ "data": { /* ConversationDetail */ } }
```

Errors: `401`, `403`, `404 CONVERSATION_NOT_FOUND`.

## GET /messages — list messages

- Roles: all authenticated
- Query: `page`, `limit` (max 100), `conversationId` (conversation uuid), `status` (MessageStatus), `direction` (INBOUND|OUTBOUND), `automationId` (automation uuid), `createdFrom` (date-only, inclusive whole day), `createdTo` (inclusive), `sort` (whitelist: `-createdAt` default, `createdAt`, `sentAt`, `status`, with optional `-` prefix)
- Tenant-scoped via `organizationId`; cross-tenant filters yield empty results, never rows

200 OK:

```json
{ "data": [ /* MessageSummary[] */ ], "meta": { "page": 1, "limit": 20, "total": 3, "pages": 1 } }
```

Errors: `401`, `403`.

## GET /messages/{uuid} — message detail

- Roles: all authenticated
- Cross-tenant or unknown → `404 MESSAGE_NOT_FOUND`

200 OK:

```json
{ "data": { /* MessageDetail */ } }
```

Errors: `401`, `403`, `404 MESSAGE_NOT_FOUND`.

## POST /messages — manual send

- Roles: all authenticated, including OPERADOR (HG-11, FR-011)
- Header: `Idempotency-Key` (API_GUIDELINES §19) — repeat with same key returns the same result, no duplicate send
- Body:

```json
{
  "customerId": "…",              // required, customer uuid
  "content": "Hola …",            // required, 1..4096 chars (R-020)
  "channel": "WHATSAPP_CLIENTS"   // optional, default WHATSAPP_CLIENTS
}
```

- Validations: customer exists in tenant → else `404 CUSTOMER_NOT_FOUND`; customer has a phone → else `400 CUSTOMER_NO_PHONE` (R-020); content invalid → `400 VALIDATION_ERROR`
- Behavior: find-or-open the customer's OPEN conversation for the channel (R-010/C-05), create OUTBOUND MANUAL Message, call provider after commit, update QUEUED → SENT/FAILED (FR-004, R-011). Provider outage → `502 PROVIDER_ERROR` (message recorded as FAILED, NR-011)

201 Created:

```json
{ "data": { "uuid": "…", "status": "SENT", "direction": "OUTBOUND", "type": "MANUAL", "conversationId": "…", "createdAt": "…" } }
```

The send is synchronous: on success the response is the persisted `MessageDetail` with status `SENT` (and provider ids set); on provider failure the message is persisted as `FAILED` and the request returns `502 PROVIDER_ERROR` (NR-011).

Errors: `400 VALIDATION_ERROR`, `400 CUSTOMER_NO_PHONE`, `401`, `403`, `404 CUSTOMER_NOT_FOUND`, `502 PROVIDER_ERROR`, `409` (duplicate Idempotency-Key in-flight handling).

## POST /webhooks/whatsapp — inbound + status callbacks (public, HG-4)

- No JWT. Provider-authenticated (R-017).
- Verification GET (Meta handshake): `hub.mode`, `hub.verify_token`, `hub.challenge` — token mismatch → `403 INVALID_VERIFY_TOKEN`; match → 200 `{hub.challenge}`.
- POST: verify `X-Hub-Signature-256` (HMAC-SHA256 of raw body with `WHATSAPP_WEBHOOK_SECRET`); invalid → `401 INVALID_SIGNATURE`; valid but irrelevant payload (no messages/statuses) → 200 (accepted, no-op).
- Payloads handled (FR-005/FR-006):
  - `messages` entries (`from`, `id`, `text.body`, `timestamp`) → customer identification (R-009), find-or-open conversation, create INBOUND Message (type INCOMING, direction INBOUND), emit `MessageReceived` + `ConversationOpened` on first message. Unknown number → conversation with `customerId = null` (HG-8).
  - `statuses` entries (`id`, `status`: SENT/DELIVERED/READ/FAILED, `conversation` id) → guarded update of the matching Message by `providerMessageId` (R-016, idempotent; stale/out-of-order → no-op).
- Idempotency: replayed inbound webhooks with the same `providerMessageId` → P2002 on `(organizationId, providerMessageId)` → no-op, never 500 (R-013, NR-006).

200 OK (acknowledged):

```json
{ "status": "received" }
```

Errors: `401 INVALID_SIGNATURE`, `403 INVALID_VERIFY_TOKEN`.

## Error codes (controlled exceptions)

`CONVERSATION_NOT_FOUND` (404), `MESSAGE_NOT_FOUND` (404), `CUSTOMER_NOT_FOUND` (404), `VALIDATION_ERROR` (400), `CUSTOMER_NO_PHONE` (400), `FORBIDDEN` (403), `UNAUTHORIZED` (401), `PROVIDER_ERROR` (502), `INVALID_SIGNATURE` (401), `INVALID_VERIFY_TOKEN` (403). Never leak internals (Constitution IX).

## OpenAPI wiring

Paths `specs/api/paths/messages.yaml` and `conversations.yaml` are currently empty scaffolds (R-012); populate with the shapes above and wire via root `openapi.yaml` `$ref`s. Tags `Conversations`/`Messages` already exist (`info/tags.yaml:33-39`). The webhook is documented here and in the spec (API_GUIDELINES §24 note), not part of the REST tag surface.