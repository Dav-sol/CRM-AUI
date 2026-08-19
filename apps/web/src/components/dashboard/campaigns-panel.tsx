"use client";

import type { DashboardCampaigns } from "@/lib/sdk-types";
import { CalendarClock, Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};

const TYPE_LABELS: Record<string, string> = {
  AUTOMATIC: "Automática",
  MANUAL: "Manual",
  REPURCHASE: "Recompra",
  SPECIAL: "Especial",
};

type CampaignsPanelProps = {
  data: DashboardCampaigns | null;
};

export function CampaignsPanel({ data }: CampaignsPanelProps) {
  if (data === null) {
    return (
      <div className="space-y-3" aria-label="Cargando campañas">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const upcoming = data.upcoming;

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Sin campañas próximas"
        description="Las campañas programadas aparecerán acá."
      />
    );
  }

  return (
    <ul className="space-y-3" aria-label="Próximas campañas">
      {upcoming.slice(0, 5).map((campaign) => (
        <li
          key={campaign.uuid}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{campaign.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3" aria-hidden="true" />
              {campaign.startAt ? formatDate(campaign.startAt) : "Sin fecha"}
              <span aria-hidden="true">·</span>
              {TYPE_LABELS[campaign.type] ?? campaign.type}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {STATUS_LABELS[campaign.status] ?? campaign.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}