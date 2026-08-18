# Dashboard v1 — API Contract (contract-first)

Base path: `/api/v1/dashboard`. All REST responses use the standard envelope `{ data }` or `{ error: { code, message, details? } }` (API_GUIDELINES §6-8). All REST endpoints require `Authorization: Bearer <JWT>`.

## 1. Shared shapes

```ts
enum CampaignType { AUTOMATIC, MANUAL, REPURCHASE, SPECIAL }
enum CampaignStatus { DRAFT, ACTIVE, PAUSED, FINISHED, CANCELLED }

interface CampaignRef {
  uuid: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startAt: string | null;  // ISO 8601 UTC
  createdAt: string;      // ISO 8601 UTC
}
```

## 2. GET /api/v1/dashboard/summary

Global KPIs of the organization (computed on-the-fly, `deletedAt: null`, org from JWT only — HG-1/HG-3).

```ts
// 200
interface DashboardSummary {
  customers: {
    total: number;        // customer count
    newThisMonth: number; // createdAt in current calendar month (UTC)
  };
  purchases: {
    total: number;        // purchase count
    thisMonth: number;    // purchaseDate in current calendar month (UTC)
  };
  automations: {
    scheduled: number;    // status = SCHEDULED
  };
  messages: {
    sent: number;         // status = SENT
    pending: number;      // status = QUEUED
  };
  conversations: {
    open: number;         // status = OPEN
  };
  campaigns: {
    active: number;       // status = ACTIVE
  };
}
```

## 3. GET /api/v1/dashboard/campaigns

Campaign panels (Flujo 09: "Campañas").

```ts
// 200
interface DashboardCampaigns {
  recent: CampaignRef[];   // createdAt desc, take 10
  upcoming: CampaignRef[]; // ACTIVE + startAt > now, startAt asc, take 10
}
```

## 4. GET /api/v1/dashboard/activity

Activity feed ("Actividad del sistema") — last audit entries of the org (read of `Audit`).

```ts
// 200
interface DashboardActivityItem {
  uuid: string;
  module: string;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  userName: string | null; // "<firstName> <lastName>" of the acting user
  createdAt: string;       // ISO 8601 UTC
}

// 200 — take 20, createdAt desc
type DashboardActivity = DashboardActivityItem[];
```

## 5. Errors

| HTTP | Code | When |
|---|---|---|
| 401 | UNAUTHORIZED | missing/invalid JWT (global guard) |
| 500 | INTERNAL_SERVER_ERROR | unexpected failure (controlled, never leaks internals) |

No 400/404 cases: the module takes no tenant-scoped input; the org comes from the JWT (Q6).