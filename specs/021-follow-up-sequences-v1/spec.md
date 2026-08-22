# Seguimientos v1 — Feature Specification

## 1. Purpose

The FollowUpSequence module (`Módulo Seguimientos`) models the full post-sale
warranty journey of a battery: from the purchase date to (and beyond) the
warranty expiration. A sequence is a set of stages; each stage schedules one
`Automation` per qualifying purchase when its campaign is activated.

This document defines the temporal semantics that were previously only
partially documented in the OpenAPI contracts
(`specs/api/components/schemas/FollowUpSequence/*`).

## 2. Clarifications (Q&A)

- **Q1: What temporal reference does each stage use?** → A1: Each
  `FollowUpSequenceStage` carries an `anchor`:
  - `PURCHASE_DATE` → offset measured from `purchase.purchaseDate`.
  - `WARRANTY_EXPIRY` → offset measured from `purchase.warrantyExpiresAt`.

  This was decided in HG-SEM-01 (approved 2026-08-22): one sequence can mix
  both anchors so the whole journey (purchase → warranty expiry → post-warranty)
  is expressible in a single sequence.

- **Q2: How is `scheduledDate` computed?** → A2:
  `scheduledDate = base(anchor) + offsetDays` (calendar days, preserving the
  anchor wall-clock time). Previously every stage was implicitly anchored to
  `warrantyExpiresAt` (`campaigns.service.ts` `generateAutomationsFromSequence`),
  which made a "D+3 after purchase" stage land ~1 year later for 12-month
  warranties. HG-SEM-01 fixes this by making the anchor explicit per stage.

- **Q3: What happens with existing sequences created before `anchor` existed?** → A3:
  The migration backfills `anchor = WARRANTY_EXPIRY` (NOT NULL, default), so
  legacy behavior (`warrantyExpiresAt + offsetDays`) is preserved without
  silent changes (HG-SEM-02). `anchor` is optional in the API (default
  `WARRANTY_EXPIRY`), so existing clients keep working.

- **Q4: What are the allowed `offsetDays` ranges?** → A4 (HG-SEM-06):
  - `PURCHASE_DATE`: `0..365` (negative offsets rejected — a stage cannot fire
    before the purchase).
  - `WARRANTY_EXPIRY`: `-365..730` (negative = before expiration, `0` = day of
    expiration, positive = after expiration; up to 2 years post-warranty).

- **Q5: Do stages fire for purchases without a warranty?** → A5 (HG-SEM-05):
  Per-anchor rule:
  - `PURCHASE_DATE` stages always generate.
  - `WARRANTY_EXPIRY` stages require `purchase.warrantyExpiresAt != null`;
    otherwise the stage is skipped for that purchase.
  Legacy sequences (all `WARRANTY_EXPIRY`) therefore keep the previous
  "skip purchases without warranty" behavior.

- **Q6: What happens to a stage whose computed date already passed at campaign
  activation?** → A6 (HG-SEM-03): it is **not** sent with its original message
  and it is **not** silently skipped. It is converted into an immediate
  repurchase opportunity:
  - One automation per purchase (at most one — HG-SEM-03 dedupe), using the
    most advanced past stage (largest computed `scheduledDate`; tie-break:
    larger `offsetDays`, then stage order).
  - `scheduledDate = now` (captured once at activation; the scheduler delivers
    on the next tick).
  - `messageTemplate = stage.templateOnPast ?? campaign.template` (fallback).
  - The message communicates that the customer is already in a
    renewal/repurchase window (never "just happened").
  Stages whose computed date is today or in the future keep their original
  `scheduledDate` and `messageTemplate`.

- **Q7: Can a sequence mix both anchors?** → A7: Yes (HG-SEM-04).

- **Q8: Are duplicate stages allowed?** → A8: No. Each stage must have a unique
  `(anchor, offsetDays)` combination (previously uniqueness was on `offsetDays`
  alone).

- **Q9: How are stages ordered?** → A9: By `(anchor, offsetDays)` asc:
  `PURCHASE_DATE` first (timeline from purchase), then `WARRANTY_EXPIRY`.

- **Q10: Is the `Automation` row self-sufficient?** → A10: Yes. The generation
  snapshot writes `messageTemplate` (the original stage template, or the
  repurchase template for converted stages) and a resolved `scheduledDate` into
  each `Automation`. Later sequence/campaign edits do not affect already
  generated automations (HG-FUS-02). The scheduler/WhatsApp only read stored
  values; they never recompute dates.

## 3. Data Model

```prisma
enum FollowUpStageAnchor {
  PURCHASE_DATE
  WARRANTY_EXPIRY
}

model FollowUpSequenceStage {
  id             String               @id @default(cuid())
  uuid           String               @unique @default(uuid())
  sequenceId     String               @map("sequence_id")
  name           String
  anchor         FollowUpStageAnchor  @default(WARRANTY_EXPIRY)
  offsetDays     Int                  @map("offset_days")
  template       String
  templateOnPast String?              @map("template_on_past") // optional repurchase message (HG-SEM-03)
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")
  deletedAt      DateTime?            @map("deleted_at")
  deletedBy      String?              @map("deleted_by")

  sequence FollowUpSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)

  @@index([sequenceId])
  @@map("follow_up_sequence_stages")
}
```

Migration `20260822180207_add_follow_up_stage_anchor` adds `anchor` (NOT NULL
default `WARRANTY_EXPIRY`) and `template_on_past` (nullable) — non-destructive.

## 4. Functional Requirements

- **FR-001**: Create/update sequence accepts `anchor` (optional enum, default
  `WARRANTY_EXPIRY`) and `templateOnPast` (optional string) per stage.
- **FR-002**: Validation: per-anchor `offsetDays` bounds (Q4); unique
  `(anchor, offsetDays)` (Q8); at least one stage; stages require `name`,
  `template`, `offsetDays`.
- **FR-003**: Detail/list order stages by `(anchor, offsetDays)` asc (Q9).
- **FR-004**: Campaign activation (`campaigns.service.ts`
  `generateAutomationsFromSequence`): per qualifying purchase and per stage,
  resolve `base` from the anchor and compute `scheduledDate`; apply the
  HG-SEM-05 per-anchor skip and the HG-SEM-03 repurchase conversion.
- **FR-005**: The repurchase conversion writes `scheduledDate = now` and
  `messageTemplate = templateOnPast ?? campaign.template` (Q6); at most one per
  purchase.
- **FR-006**: Snapshot semantics preserved: generated `Automation` rows store
  the resolved date and message template (Q10).
- **FR-007**: Tenant isolation unchanged: sequences are org-scoped; campaign
  activation resolves sequences within the caller organization only.

## 5. Temporal Examples

Purchase `2026-08-01`, warranty 12 months → `warrantyExpiresAt = 2027-08-01`:

| Stage                  | Anchor          | Offset | scheduledDate |
| ---------------------- | --------------- | -----: | ------------- |
| Garantía digital       | PURCHASE_DATE   |      0 | 2026-08-01    |
| Confirmación postventa | PURCHASE_DATE   |      3 | 2026-08-04    |
| Revisión inicial       | PURCHASE_DATE   |     30 | 2026-08-31    |
| Chequeo intermedio     | PURCHASE_DATE   |    180 | 2027-01-28    |
| Alerta de vencimiento  | WARRANTY_EXPIRY |    -60 | 2027-06-02    |
| Oferta renovación      | WARRANTY_EXPIRY |    -30 | 2027-07-02    |

## 6. Non-Functional Requirements

- **NR-001**: Envelope `{ data }` / `{ error: { code, message } }`
  (API_GUIDELINES).
- **NR-002**: `organizationId` only from JWT; cross-tenant → 404.
- **NR-003**: Generation inside a single transaction with the campaign
  activation; the `rows × stages` precheck remains a safe upper bound for the
  `SEGMENT_TOO_LARGE` cap (dedupe only reduces the total).
- **NR-004**: Calendar-day arithmetic via a shared helper (UTC or local must be
  consistent); known pre-existing inconsistencies in month helpers are
  documented, not silently changed.