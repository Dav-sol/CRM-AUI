# Dashboard v1 — Data Model

## Baseline

All read sources already exist in `apps/api/prisma/schema.prisma`:

| Source | Model (lines) | Key indexes |
|---|---|---|
| KPIs | `Customer` (90-119) | `[organizationId]`, `[organizationId, status]`, `[organizationId, createdAt]` |
| KPIs | `Purchase` (144-175) | `[organizationId]`, `[organizationId, purchaseDate]`, `[organizationId, status]` |
| KPIs | `Automation` (220-249) | `[organizationId]`, `[organizationId, status]` |
| KPIs | `Conversation` (252-277) | `[organizationId]`, `[organizationId, status]` |
| KPIs | `Message` (279-310) | `[organizationId]`, `[organizationId, status]` |
| KPIs | `Campaign` (197-218) | `[organizationId]` |
| Activity | `Audit` (488-511) | `[organizationId]`, `[createdAt]` |

## Delta

**Zero schema changes.** No new tables, columns, indexes or enums; no migration generated. Read-only module (HG-1).

## Query patterns

```ts
// KPI counts (parallel, org-scoped, soft-delete aware):
prisma.customer.count({ where: { organizationId, deletedAt: null } });
prisma.customer.count({ where: { organizationId, deletedAt: null, createdAt: { gte: monthStart } } });
prisma.purchase.count({ where: { organizationId, deletedAt: null } });
prisma.purchase.count({ where: { organizationId, deletedAt: null, purchaseDate: { gte: monthStart } } });
prisma.automation.count({ where: { organizationId, deletedAt: null, status: 'SCHEDULED' } });
prisma.message.count({ where: { organizationId, deletedAt: null, status: 'SENT' } });
prisma.message.count({ where: { organizationId, deletedAt: null, status: 'QUEUED' } });
prisma.conversation.count({ where: { organizationId, deletedAt: null, status: 'OPEN' } });
prisma.campaign.count({ where: { organizationId, deletedAt: null, status: 'ACTIVE' } });

// Campaigns panel:
prisma.campaign.findMany({ where: { organizationId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 });
prisma.campaign.findMany({
  where: { organizationId, deletedAt: null, status: 'ACTIVE', startAt: { gt: now } },
  orderBy: { startAt: 'asc' },
  take: 10,
});

// Activity feed:
prisma.audit.findMany({
  where: { organizationId },
  orderBy: { createdAt: 'desc' },
  take: 20,
  include: { user: { select: { firstName: true, lastName: true } } },
});
```

Notes:
- `purchaseDate` (not `createdAt`) for month purchases (R-002): the commercial date. Month boundary = UTC calendar start (`new Date(now.getUTCFullYear(), now.getUTCMonth(), 1)`); month-end not needed (open-ended `gte`).
- Upcoming campaigns query on `Campaign` uses `[organizationId]` + in-memory filter of a small per-tenant set; a composite index `[organizationId, status, startAt]` is a documented future option if campaigns grow (no change in v1).
- `Audit.organizationId` is nullable by schema; the where-clause filters the org's own rows only.

## Invariants

- Every dashboard query is org-scoped by construction (org id from JWT only) — no cross-tenant reads (NR-001).
- Soft-deleted rows never counted (CO-003).
- No writes, no events, no audit writes (FR-005).
- `take` bounds: 10 (campaigns), 20 (activity).