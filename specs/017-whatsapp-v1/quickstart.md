# WhatsApp/Messaging v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}` as needed. Env must include the WhatsApp credentials (`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_DEFAULT_ORGANIZATION_ID`, R-018).

## S1 — Automatic execution (Flujo 05, US1)

A SCHEDULED automation whose `scheduledDate` passes (import a purchase 3 days ago, or advance the clock) → the scheduler (every minute, HG-3) executes it: customer ACTIVE → OUTBOUND message sent, automation EXECUTED.

```bash
curl -s "http://localhost:3000/api/v1/automations?status=SCHEDULED" -H "Authorization: Bearer $TOKEN"
# after the tick: { data: [ { status: "EXECUTED", executedDate } ] }
curl -s "http://localhost:3000/api/v1/messages?automationId={uuid}" -H "Authorization: Bearer $TOKEN"
# { data: [ { type: "AUTOMATIC", direction: "OUTBOUND", status: "SENT", content } ] } (AS-001)
```

The same automation never runs twice (AU-011): re-advancing the clock produces no second message (AS-002). INACTIVE/BLOCKED customer → automation stays SCHEDULED (AS-003).

## S2 — Manual send (Flujo 07, US2)

```bash
curl -s -X POST http://localhost:3000/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "customerId": "{customerUuid}", "content": "Hola, recordatorio de su garantía." }'
# 201 { data: { status: "QUEUED", direction: "OUTBOUND", type: "MANUAL", conversationId } } (AS-004)
```

OPERADOR token: manual send → 200/201 (HG-11, AS-005). Customer without phone → `400 CUSTOMER_NO_PHONE`. Provider down → `502 PROVIDER_ERROR` (message recorded FAILED, AS-012).

## S3 — Inbound webhook (Flujo 06, US3)

Simulate a customer reply (provider handshake + signed payload — see research R-008/R-017):

```bash
# GET verification (once): hub.mode=subscribe&hub.verify_token={TOKEN}&hub.challenge={CH}
curl -s "http://localhost:3000/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$VERIFY&hub.challenge=12345"
# 200 12345
# POST with a signed messages payload → 200 { "status": "received" }
```

Known number → INBOUND Message + conversation OPENED (`MessageReceived` + `ConversationOpened`), AS-006. Unknown number → conversation with `customerId = null` (HG-8, AS-007). Replay of the same `providerMessageId` → no-op, never a duplicate (AS-008).

## S4 — Conversation history (Flujo 06/07, US4)

```bash
curl -s "http://localhost:3000/api/v1/conversations?status=OPEN" -H "Authorization: Bearer $TOKEN"
# { data: [ { uuid, status: "OPEN", channel: "WHATSAPP_CLIENTS", messageCount, lastMessageAt } ], meta: {...} }
curl -s "http://localhost:3000/api/v1/conversations/{uuid}" -H "Authorization: Bearer $TOKEN"
# { data: { messages: [ INBOUND + OUTBOUND in order ], ... } } (AS-009)
```

Filters `status`/`channel`/`customerId`/`advisorId`/date range + pagination (AS-010). Cross-tenant conversation/message → `404` (AS-011).

## S5 — Status callbacks (Q9, US1)

Provider sends status events (SENT → DELIVERED → READ) keyed by `providerMessageId` → the message transitions guardedly and timestamps fill (`sentAt`/`deliveredAt`/`readAt`); stale/out-of-order callbacks are no-ops (AS-008/R-016).

## S6 — Audit trail (US6, FR-013)

Rows `message.send.success`, `message.received.success`, `conversation.opened.success`, `automation.executed` exist under module `whatsapp` (audit endpoint; AS-013).

## S7 — Events

Consumers of `MessageSent`/`MessageReceived`/`ConversationOpened`/`AutomationExecuted` (07:194-242) receive traceability payloads (07:383-395) — the event bus can be observed via the `events` inspection endpoints used by prior kits.

## S8 — Scheduler off in tests

With `NODE_ENV=test` the tick is disabled (NR-012); e2e drives execution by invoking the service method directly (AS-014 keeps suites deterministic).