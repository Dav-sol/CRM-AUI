# SMS v1 — Research Notes

## R-001 — Current messaging architecture (state)

The `whatsapp` module owns all message execution: `WhatsappScheduler` (`@Interval(60_000)`, `whatsapp.scheduler.ts`) polls `Automation` rows (batch 100, `SCHEDULER_BATCH_SIZE`), picks `SCHEDULED/ERROR` automations with `scheduledDate <= now`, and executes via `WhatsAppProvider.sendMessage()`. The `WhatsAppProvider` interface (`whatsapp.provider.ts:26`) covers only `send(to, text)`. Webhook parsing/verification is hardcoded to `MetaWhatsAppProvider`. Pancake is org-scoped and dormant. SMS: `SmsProvider` interface + `NullSmsProvider` exist in `sms.provider.ts`/`sms.module.ts` but are **never consumed** — nothing injects `SMS_PROVIDER`. The scheduler query has no channel filter (picks all automations).

## R-002 — Channel abstraction design (INFERENCIA)

The existing `ChannelType` enum (`WHATSAPP_CLIENTS`, `WHATSAPP_SOCIAL`) lives on `Conversation` only. Messages have no channel field. For SMS, which doesn't create conversations, channel must live on `Message` directly (denormalized for query). `Automation.channel` snapshots the campaign's channel at generation time (like `messageTemplate` snapshots the template). `Campaign.channel` is the user-facing channel selection. This three-level snapshot ensures channel consistency even if campaign config changes after activation.

## R-003 — Message.conversationId nullable (HG-3)

Current: `Message.conversationId String` NOT NULL (schema.prisma:399). SMS v1 one-way messages with alphanumeric sender cannot create conversations (Fase 9: "No crear una falsa experiencia de conversación"). Making `conversationId` nullable allows SMS Messages to exist without a Conversation, linked directly to `customerId`. Existing WhatsApp messages are unaffected (all retain their `conversationId`). The nullable change is the ONLY destructive-level schema modification; migration uses `ALTER COLUMN DROP NOT NULL` which is safe and reversible.

## R-004 — SMS segment calculation (encoding detection)

GSM-7 character set: 0x00–0x7F (A-Z, a-z, 0-9, space, punctuation, Greek uppercase Α-Ω for some chars). Extended GSM-7: `^{}\[]~|€` (escape char 0x1B). Non-GSM-7 chars → UCS-2 encoding. Segment limits: GSM-7: 160 (single), 153 (multipart); UCS-2: 70 (single), 67 (multipart). The `countSmsSegments()` function checks each character against GSM-7 charset; if any non-GSM-7 char found → UCS-2 encoding; segment count = ceil(messageLength / segmentLimit). Utility is pure function, testable independently.

## R-005 — Provider comparison (Colombia)

| Provider | Price/msg CO | Sender | Compliance | Webhook | Notes |
|----------|-------------|--------|------------|---------|-------|
| Háblame | Negotiable (local) | NDC 940 bidirectional, short code | RNE/CRC automatic, SALIR/CANCELAR | Yes | Local, Spanish support, CRC-native |
| Twilio | ~$0.059/segment | Alphanumeric (registration) | Manual | Excellent | International reference |
| Vonage | ~$0.035/msg | Alphanumeric | Manual | Good | Mid-tier |
| Bird | $0.051/msg alphanumeric | Registration mandatory CO | Quiet hours 20-09 | Good (idempotency) | Registration lead time |
| Infobip | Quote-based | Registration 1-3 days | Manual | Good | Enterprise |

Decision: abstraction-first; provider selected at deployment. Háblame recommended for Colombia CRC compliance.

## R-006 — Scheduler split design (minimal WhatsApp change)

Current `executeDueAutomations()` query (whatsapp.service.ts:193-227) has no channel filter — it picks ALL automations. Adding `channel: 'WHATSAPP_CLIENTS'` to this query is the single minimal change required. A new `SmsScheduler` (in `messaging/` module) runs the same pattern with `channel: 'SMS'`. Both schedulers coexist safely because:
- Row-level guarded transitions (`SCHEDULED→EXECUTING` via `updateMany` with status guard) prevent double-send
- The `campaignId IS NULL OR campaign.status = 'ACTIVE'` filter works for both
- `customer.noContactAt: null` filter works for both

Future V2 can unify into a single `ChannelScheduler` with provider routing.

## R-007 — Quiet hours for Colombia

Bird documentation states Colombia quiet hours: 20:00–09:00 for commercial messages. CRC Resolución 5050/2016 and Ley 2300/2023 require opt-out and RNE validation. TRANSACTIONAL messages (D+3 post-sale, warranty follow-up) bypass quiet hours. The executor checks `purpose` before applying quiet hours: if `COMMERCIAL` and current hour in [20,21,22,23,0,1,2,3,4,5,6,7,8] (America/Bogota) → defer to next allowed hour.

## R-008 — Cost tracking design

Two cost fields: `estimatedCost` (set at Message creation, before provider send) and `actualCost` (set after provider confirmation, if provider reports actual segments/cost). Most SMS providers report segments per message in their API response. `currency` defaults to COP. Config: `SMS_COST_PER_SEGMENT` (env, default 100 COP), `SMS_CURRENCY` (env, default COP). For WhatsApp, existing `WHATSAPP_MESSAGE_COST` (200 COP) and `WHATSAPP_MESSAGE_COST_COMMERCIAL` (400 COP) remain unchanged.

## R-009 — reports.service.ts broken query (fix scope)

`reports.service.ts:259-273` selects `automationCount, delivered, responded, sales, revenue` directly from `prisma.campaign.findMany` — these columns don't exist on `Campaign` model (schema.prisma:246-276). This would fail at runtime with a Prisma validation error. Fix: replace with the existing `loadCampaignAttribution()` pattern from `campaigns.service.ts:1625-1673` which computes these metrics correctly.

## R-010 — Data model delta (HG-3/HG-4)

Additive only (precedent R-009 of 019):
- `ChannelAccount` new model (Fase 7 prep)
- `ChannelType` gains `SMS` value
- `ChannelProvider`, `ChannelAccountStatus`, `PurchaseSource` new enums
- `Campaign.channel`, `Campaign.channelAccountId` additive columns
- `Automation.channel`, `Automation.channelAccountId` additive columns
- `Message` gains 8 new columns + `conversationId` nullable change + `customerId` direct link
- `Purchase.source` additive column with default `CRM`

No destructive changes; backfills safe CRM defaults.

## R-011 — WACRM analysis (Fase 12)

WACRM (github.com/ArnasDon/wacrm) is a WhatsApp Business API inbox app. Answers:
1. **Integrate?** No now. Later as V2 WhatsApp inbox layer.
2. **Use as inbox?** Possible candidate for V2 specialized WhatsApp inbox.
3. **Replace Conversations?** No. Automatize It = source of truth for CRM, purchases, warranties, journeys, marketing.
4. **Separate app?** Yes, keep separate. Sync contacts/conversations only.
5. **Data sync?** Contacts (by phone), conversations, messages. Risk: duplication.
6. **Duplication?** Customer by phone (same entity, two systems). Timeline fragmentation. Resolution: Automatize It owns Purchase/Campaign/Automation; WACRM owns WhatsApp conversation state.
7. **Number isolation?** Via `ChannelAccount` (channel=WHATSAPP_SOCIAL, org-scoped).
8. **Source of truth?** Automatize It = CRM source. WACRM = specialized WhatsApp V2 inbox component.

## R-012 — Altiria REST API (source of truth)

**Endpoint**: `POST {DASHBOARD_HOST}/api/rest/sms` (REST v2)

**Authentication**: Basic — `Authorization: Basic base64(usuario:apiPassword)`. Credentials: `ALTIRIA_USERNAME` / `ALTIRIA_API_PASSWORD`.

**Request body**:
```json
{
  "to": ["573001234567"],
  "from": "MiEmpresa",
  "message": "Text content",
  "encoding": "gsm|gsm-ext|utf-16",
  "parts": 1,
  "notificationUrl": "https://callback?token=xxx&id=%i&status=%s&phone=%P&cost=%c"
}
```
- `from` optional (Colombia: alphanumeric sender may not work in LatAm, omit if `SMS_SENDER` empty)
- `encoding`: `gsm` for GSM-7, `utf-16` for UCS-2
- `parts`: segment count (1–15), must match actual segments or error 105/110

**Response 202** (accepted):
```json
{
  "campaignId": "...",
  "sendingId": "...",
  "result": [{ "accepted": true, "to": "573001234567", "id": "...", "parts": 1 }]
}
```
- `accepted: true` with `id` and `parts` = success
- `accepted: false` = rejection (check `error` in body)

**Response 207** (partial success): same `result[]` structure per recipient.

**Error responses** (400/401/402):
```json
{ "error": { "code": 103, "description": "Invalid credentials" } }
```

**Error code table** (key values):

| Code | HTTP | Description |
|------|------|-------------|
| 0 | 202 | Success |
| 103 | 401 | Invalid credentials |
| 105 | 400 | Message too long (>15 parts) |
| 106 | 400 | Sender missing/invalid |
| 109 | 400 | Invalid notificationUrl |
| 110 | 400 | Parts parameter invalid |
| 111 | 402 | Insufficient credits |
| 112 | 401 | IP not whitelisted |
| 102 | 400 | Invalid recipient |

## R-013 — Altiria DLR (Delivery Report)

Altiria sends **GET** requests to the configured `notificationUrl` with escape variables:

| Variable | Meaning |
|----------|---------|
| `%i` | Altiria message ID (providerMessageId for correlation) |
| `%s` | Status code (Altiria-specific string) |
| `%P` | Destination phone number |
| `%c` | Cost per message |

**DLR status mapping to MessageStatus**:

| Altiria status | MessageStatus | Meaning |
|----------------|---------------|---------|
| ACCEPTD | SENT | Accepted by operator |
| DELIVRD | DELIVERED | Confirmed delivered to handset |
| RECEIVED | DELIVERED | Handset received |
| EXPIRED | FAILED | Expired (not delivered within window) |
| DELETED | FAILED | Deleted by operator |
| UNDELIV | FAILED | Undeliverable |
| REJECTD | FAILED | Rejected by operator |
| UNKNOWN | — | Ignore (transient, no action) |

**Correlation**: `messageUuid` (our UUID) passed as static query param; `%i` as fallback via `providerMessageId`. Idempotent: only advance status, never regress.

## R-014 — Colombia regulatory restrictions (Altiria)

**Time restrictions for commercial/marketing SMS** (per Altiria docs + Resolución 5050/2016):
- Monday–Friday: 7:00–19:00 (local time)
- Saturday: 8:00–15:00
- Sundays and holidays: **blocked** (messages auto-rescheduled by Altiria)

**Key behaviors**:
- Messages sent outside permitted windows are **automatically blocked and rescheduled** by Altiria to the next allowed slot (applies to marketing-classified traffic only)
- Transactional messages (warranty, post-sale follow-up) are **not affected** by time restrictions
- Sender ID may not work in LatAm — omit `from` if `SMS_SENDER` is empty

**Platform defaults** (unchanged):
- `SMS_COMMERCIAL_QUIET_HOURS_START=20`, `SMS_COMMERCIAL_QUIET_HOURS_END=9`
- Default: 20:00–09:00 quiet hours (mon–fri enforced via `SmsScheduler`)
- Saturday afternoon (15:00–24:00) and Sunday full day are NOT enforced by current quiet-hours logic — these are Altiria-side auto-deferrals for Colombian accounts only

**Production checklist** (before go-live):
1. Register server IP in Altiria dashboard (IP whitelist)
2. Configure webhook URL for DLR callbacks (`SMS_WEBHOOK_BASE_URL`)
3. Review Colombia commercial SMS restrictions (this section)
4. Validate scheduler behavior outside permitted windows
5. Define behavior for scheduled messages outside window (reject/defer/reschedule) — current: defer (stays SCHEDULED, retried next tick)
