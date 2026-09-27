# SMS v1 — Tasks

## Phase 0 — Spec & gates (approved)

- [x] T200: Kit 022-sms-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-6 approved 2026-08-31.

## Phase 1 — Persistence (migration)

- [ ] T201: Prisma delta (per data-model.md): new models `ChannelAccount`; new enums `ChannelProvider`, `ChannelAccountStatus`, `PurchaseSource`; extend `ChannelType` with `SMS`; additive columns on `Campaign`, `Automation`, `Message`, `Purchase`; `Message.conversationId` nullable; indexes.
- [ ] T202: Generate migration (`add_sms_v1`), SQL reviewed per data-model.md, applied, `prisma migrate status` + typegen verified.
- [ ] T203: Seed `ChannelAccount` from env config (dev/sandbox): create `NullSmsProvider` account + `MetaWhatsAppProvider` account for default org.

## Phase 2 — Domain: messaging module (provider abstraction + segments)

- [ ] T204: Create `apps/api/src/modules/messaging/` module: `messaging.module.ts`, `messaging.controller.ts` (placeholder), `messaging.service.ts`.
- [ ] T205: `SmsProvider` interface (`sms-provider.interface.ts`): `send(input: SmsSendInput): Promise<SmsSendResult>`, `getName(): string`. DI token `SMS_PROVIDER`. Types: `SmsSendInput` (to, from, content, organizationId, messageId?, idempotencyKey?), `SmsSendResult` (providerMessageId, segments?, cost?, currency?).
- [ ] T206: `NullSmsProvider` (`null-sms.provider.ts`): logs, returns `sms-sim-{uuid}`, fakes segments=1. For dev/sandbox.
- [ ] T207: `countSmsSegments(content: string): SmsSegmentInfo` utility (`sms-segments.util.ts`): GSM-7 charset detection (0x00–0x7F excluding extended), segment limits: GSM-7 160/153, UCS-2 70/67. Pure function, unit-testable.
- [ ] T208: `SmsExecutionService` (`sms-execution.service.ts`): `executeOneAutomation(automationId)` — guarded SCHEDULED/ERROR→EXECUTING, create Message{channel:SMS, customerId, conversationId:null, segmentCount, estimatedCost}, route to SmsProvider, markSent/EXECUTED on success, ERROR+retry on failure. Follows whatsapp.service.ts:294-507 pattern.
- [ ] T209: `SmsScheduler` (`sms-scheduler.ts`): `@Interval(60_000)` tick — pick channel='SMS' automations (same query pattern as whatsapp.scheduler.ts), call `SmsExecutionService.executeOneAutomation()`. Disabled in test env.
- [ ] T210: Quiet hours logic: `isWithinQuietHours(date: Date): boolean` — checks hour in America/Bogota against configurable start/end. Used by `SmsExecutionService` for COMMERCIAL purpose automations only.

## Phase 3 — WhatsApp module (minimal channel filter)

- [ ] T211: Add `channel: 'WHATSAPP_CLIENTS'` to `executeDueAutomations()` query filter in `whatsapp.service.ts`. This is the ONLY change to the WhatsApp module. Verify existing tests still pass.

## Phase 4 — Webhook

- [ ] T212: `SmsWebhookController` (`sms-webhook.controller.ts`): `@Controller('webhooks/sms')` — `POST` endpoint with provider-specific signature verification (delegated to SmsProvider or separate verification function). Status update handling: map provider status to `MessageStatus` using `STATUS_TRANSITIONS` pattern. Always return 200.
- [ ] T213: Status update processing: update `Message.sentAt/deliveredAt`, emit `MessageSent/MessageDelivered/MessageFailed` events.

## Phase 5 — Campaigns integration

- [ ] T214: Campaign DTOs: add `channel` field to `CreateCampaignDto`, `UpdateCampaignDto`; validate: V1 only allows `SMS` for new campaigns (backend accepts `WHATSAPP_CLIENTS` for backward compat).
- [ ] T215: `estimateSegment()` extended: when `channel=SMS`, compute per-stage template segment count × customers × `SMS_COST_PER_SEGMENT`. Response: `{ count, estimatedMessages, estimatedSegments, estimatedCost, currency }`.
- [ ] T216: `activate()` extended: snapshot `channel` and `channelAccountId` from campaign to each automation; sequence stages inherit campaign channel.
- [ ] T217: `generateAutomationsFromSequence()` extended: pass `channel` and `channelAccountId` to generated automations.

## Phase 6 — Reports fix

- [ ] T218: Fix `reports.service.ts:259-273`: replace broken `prisma.campaign.findMany` select with `loadCampaignAttribution()` pattern from `campaigns.service.ts:1625-1673`.

## Phase 7 — OpenAPI + SDK

- [ ] T219: Update `specs/api/openapi.yaml`: extend `ChannelType` enum with `SMS`, add `ChannelAccount` schema, update Campaign/Automation/Message schemas with new fields, add `/webhooks/sms` path, extend segment preview response.
- [ ] T220: `npm run api:validate` green, `npm run api:generate` (orval) — SDK regenerated.

## Phase 8 — Frontend

- [ ] T221: `channel-selector.tsx`: persist `channel` in campaign save body (fix current gap); show SMS enabled, WhatsApp/Email as "Próximamente".
- [ ] T222: Campaign review tab: show "CANAL DE ENVÍO: SMS" + estimated messages + estimated segments + estimated cost + currency before activation.
- [ ] T223: Campaign detail/list: display cost per channel, segment count, delivery status for SMS.
- [ ] T224: Messages page: channel badge, cost, segments, delivery status for SMS messages.

## Phase 9 — Tests

- [ ] T225: Unit tests: `countSmsSegments()` (GSM-7, UCS-2, multipart), `SmsExecutionService` (send success/failure/retry, quiet hours, opt-out), `SmsScheduler` (channel filter), campaign `estimateSegment()` with SMS channel.
- [ ] T226: Integration tests: create SMS campaign → activate → scheduler executes → webhook delivery → Message status + cost stored.
- [ ] T227: WhatsApp regression: existing `whatsapp.service.spec.ts` still green after channel filter addition.
- [ ] T228: lint/typecheck/build; all test suites green; coverage target >80% (messaging module).

## Phase 10 — Production checklist

- [ ] T229: Document production checklist (config, security, operation, costs, marketing) per spec Fase 11.

## Phase 11 — Gates & delivery

- [ ] T230: Review diff (no unrelated files, no secrets); Conventional Commit.
