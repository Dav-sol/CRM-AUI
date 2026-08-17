# Conversations Inbox v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}` as needed. Requires the kit 017 WhatsApp env (see `specs/017-whatsapp-v1/quickstart.md`) — kit 018 adds no new env vars (R-015).

## I1 — Bandeja (Flujo 07 step 1, US1)

```bash
curl -s "http://localhost:3000/api/v1/conversations?assigned=false&status=OPEN" -H "Authorization: Bearer $TOKEN"
# { data: [ { uuid, status: "OPEN", advisor: null, tags: [], messageCount, lastMessageAt } ], meta: {...} }
curl -s "http://localhost:3000/api/v1/conversations?tagIds={tagUuid1},{tagUuid2}" -H "Authorization: Bearer $TOKEN"
# { data: [ rows whose active tags intersect the filter ], meta: {...} }
```

Unassigned/OPEN rows appear first in the asesor's daily queue (AS-001). Filters `assigned=true|false`, `tagIds`, `status`, `advisorId`, date range + pagination (≤100).

## I2 — Detail with history + notes (Flujo 07 steps 1-2, US2)

```bash
curl -s "http://localhost:3000/api/v1/conversations/{uuid}" -H "Authorization: Bearer $TOKEN"
# { data: { messages: [ INBOUND + OUTBOUND in order ], tags: [...], notes: [...], advisor: {...}|null, status } }
```

One request returns history, tags and the note log (NR-003, AS-002).

## I3 — Asesor reply (Flujo 07 step 3, US3)

```bash
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{ "content": "Hola, le confirma su compra.", "quickReplyId": "{quickReplyUuid}" }'
# 201 { data: { status: "SENT", direction: "OUTBOUND", type: "OUTGOING", conversationId } } (AS-003)
```

Replying to a CLOSED conversation reopens it to OPEN (AS-004); replying to ARCHIVED → `400 VALIDATION_ERROR` (AS-005). Provider down → `502 PROVIDER_ERROR`, message FAILED.

## I4 — Assignment / transfer (US4)

```bash
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/assign \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "advisorId": "{userUuid}" }'
# 200 { data: { uuid, advisor: { uuid, firstName, lastName } } } (AS-006)
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/transfer \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "advisorId": "{otherUserUuid}" }'
```

OPERADOR may assign/transfer too (HG-4: any role); cross-tenant advisor → `400 VALIDATION_ERROR` (AS-007); same advisor → no-op. Emits `ConversationAssigned`/`ConversationTransferred`.

## I5 — Lifecycle (Flujo 07 step 5, US5)

```bash
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/close   # OPEN -> CLOSED (AS-008)
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/archive # OPEN|CLOSED -> ARCHIVED
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/reopen  # CLOSED|ARCHIVED -> OPEN
```

Any role can transition; invalid source state → `400 VALIDATION_ERROR`; close/archive emit `ConversationClosed`/`ConversationArchived`. A closed conversation does NOT pause automatizations in v1 (HG-10, out of scope).

## I6 — Tags (US6)

```bash
curl -s -X POST http://localhost:3000/api/v1/conversation-tags \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "name": "Cliente VIP", "color": "#0EA5E9" }'          # ADMINISTRADOR/GERENTE (AS-009)
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/tags/{tagUuid}   # assign (any role)
curl -s -X DELETE http://localhost:3000/api/v1/conversations/{uuid}/tags/{tagUuid} # remove
curl -s "http://localhost:3000/api/v1/conversation-tags?sort=-conversationCount"
```

OPERADOR assigns tags but creating a tag → `403`. Duplicate name → `409 TAG_NAME_EXISTS`; re-assign → no-op.

## I7 — Notes (US7)

```bash
curl -s -X POST http://localhost:3000/api/v1/conversations/{uuid}/notes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "content": "Cliente pide factura digital." }'            # 201 (AS-010)
curl -s "http://localhost:3000/api/v1/conversations/{uuid}/notes" # log, createdAt asc
```

Append-only in v1 (no update/delete). Visible to all roles with conversation access (AS-010).

## I8 — Quick replies (US8)

```bash
curl -s -X POST http://localhost:3000/api/v1/quick-replies \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "title": "Confirmación de compra", "body": "Hola {nombre}, confirmamos su compra." }'
# 201 (AS-011; ADMINISTRADOR/GERENTE; OPERADOR -> 403)
curl -s "http://localhost:3000/api/v1/quick-replies" -H "Authorization: Bearer $TOKEN"
```

Used by reference in the reply flow (I3 `quickReplyId`).

## I9 — Audit & events (US9, US10)

```bash
# audit rows: conversation.assign/.transfer/.close/.archive/.reopen, conversation.note.create,
#   conversation.tag.assign/.remove, quick_reply.create/.update/.delete, message.send.*  (AS-013)
# events: ConversationAssigned/Transferred/Closed/Archived with traceability payloads
```

## I10 — Tenant isolation (US1-8, Q11)

Cross-tenant conversation/note/tag/quick-reply access → `404` (AS-012); cross-tenant assignment target → `400 VALIDATION_ERROR` (AS-007). Never a disclosure.

## I11 — Concurrency & idempotency (US3, US5, US6)

Repeated close on a CLOSED conversation → `400`; repeated assign of the same advisor → no-op; re-assign of the same tag → no-op; reply with a reused `Idempotency-Key` → same result, no duplicate send (AS-014).