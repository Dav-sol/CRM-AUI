# SMS v1 — Quickstart

## Prerequisites

- Node.js 24+, pnpm, Docker (PostgreSQL + Redis)
- Prisma CLI (`npx prisma`)
- Running `apps/api` with database connected

## 1. Database Migration

```bash
cd apps/api
npx prisma migrate dev --name add_sms_v1
npx prisma generate
```

## 2. Environment Variables

Add to `.env`:

```bash
# SMS Provider (null for dev/sandbox)
SMS_PROVIDER=null

# SMS API credentials (provider-specific)
SMS_API_KEY=
SMS_API_SECRET=
SMS_SENDER=

# SMS cost config (COP per segment)
SMS_COST_PER_SEGMENT=100
SMS_CURRENCY=COP

# Quiet hours for COMMERCIAL SMS (America/Bogota)
SMS_COMMERCIAL_QUIET_HOURS_START=20
SMS_COMMERCIAL_QUIET_HOURS_END=9
SMS_TIMEZONE=America/Bogota
```

## 3. Run

```bash
pnpm dev
```

The `SmsScheduler` runs every 60 seconds (like the WhatsApp scheduler) and picks `channel=SMS` automations.

## 4. Create an SMS Campaign

```
POST /api/v1/campaigns
{
  "name": "Campaña de garantía SMS",
  "type": "AUTOMATIC",
  "channel": "SMS",
  "template": "Hola {customerName}, su garantía de {productName} vence el {warrantyExpiresAt}. Visítenos.",
  "segment": { "warrantyMonths": 12 }
}
```

## 5. Preview Segment

```
POST /api/v1/campaigns/{uuid}/preview-segment
→ { "count": 150, "estimatedMessages": 300, "estimatedSegments": 315, "estimatedCost": 31500, "currency": "COP" }
```

## 6. Approve & Activate

```
POST /api/v1/campaigns/{uuid}/approve
POST /api/v1/campaigns/{uuid}/activate
```

Automations are generated with `channel=SMS`. The `SmsScheduler` executes them via the configured `SmsProvider`.

## 7. Switching Providers

Change `SMS_PROVIDER` env var and restart. The abstraction routes to the configured provider. For production, contract with Háblame (recommended for Colombia) and set `SMS_PROVIDER=HABLAME` with corresponding API credentials.

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/modules/messaging/` | Messaging module (provider, scheduler, execution) |
| `apps/api/src/modules/sms/` | Legacy stub (deprecated, replaced by messaging/) |
| `apps/api/prisma/schema.prisma` | Data model with SMS additions |
| `specs/022-sms-v1/` | Full specification |
