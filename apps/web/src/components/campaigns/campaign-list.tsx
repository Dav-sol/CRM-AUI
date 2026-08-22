"use client";

import { Megaphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListCampaigns } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CampaignItem, CampaignListParams } from "@/lib/sdk-types";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_TYPE_LABELS } from "@/lib/validators";

export type CampaignFilters = {
  page?: number;
  search?: string;
  status?: CampaignItem["status"];
  refreshKey?: number;
};

export function useCampaigns(filters: CampaignFilters) {
  const [items, setItems] = useState<CampaignItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: CampaignListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.status) {
        params.status = filters.status;
      }
      try {
        const data = await apiListCampaigns(params);
        if (!cancelled) {
          setItems(data.data);
          setMeta(data.meta ?? null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setItems([]);
        setMeta(null);
        setError("No se pudieron cargar las campañas.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.search, filters.status, filters.refreshKey]);

  return { items, meta, error };
}

export function CampaignStatusBadge({ status }: { status: CampaignItem["status"] }) {
  const variant =
    status === "ACTIVE"
      ? "default"
      : status === "FINISHED" || status === "CANCELLED"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
}

export function segmentSummary(segment: CampaignItem["segment"]): string {
  if (!segment) {
    return "Todos los clientes";
  }
  const CUSTOMER_STATUS_LABELS: Record<string, string> = {
    ACTIVE: "clientes activos",
    INACTIVE: "clientes inactivos",
    BLOCKED: "clientes bloqueados",
  };
  const parts: string[] = [];
  if (segment.city) {
    parts.push(`ciudad ${segment.city}`);
  }
  if (segment.purchaseFrom || segment.purchaseTo) {
    const from = segment.purchaseFrom ? `desde ${segment.purchaseFrom}` : "";
    const to = segment.purchaseTo ? `hasta ${segment.purchaseTo}` : "";
    parts.push([from, to].filter(Boolean).join(" "));
  }
  if (segment.customerStatus) {
    parts.push(CUSTOMER_STATUS_LABELS[segment.customerStatus] ?? segment.customerStatus);
  }
  if (segment.productId) {
    parts.push("producto específico");
  }
  return parts.length > 0 ? parts.join(" · ") : "Criterios de compra";
}

type CampaignListProps = {
  items: CampaignItem[] | null;
  error: string | null;
  onChanged: () => void;
};

export function CampaignList({ items, error, onChanged }: CampaignListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando campañas">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState icon={Megaphone} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Sin campañas"
        description="Cuando crees campañas de seguimiento, las vas a ver acá."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de campañas">
      {items.map((campaign) => (
        <li key={campaign.uuid} className="flex items-center gap-4 px-4 py-3">
          <Link href={`/campaigns/${campaign.uuid}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{campaign.name}</p>
              <Badge variant="outline">{CAMPAIGN_TYPE_LABELS[campaign.type]}</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {segmentSummary(campaign.segment)} ·{" "}
              {campaign.automationCount > 0
                ? `${campaign.automationCount} automatizaciones, ${campaign.executedCount} ejecutadas`
                : "sin automatizaciones aún"}
              {campaign.startAt ? ` · inicia ${formatDate(campaign.startAt)}` : ""}
            </p>
          </Link>
          <CampaignStatusBadge status={campaign.status} />
          <CampaignActions uuid={campaign.uuid} status={campaign.status} onChanged={onChanged} />
        </li>
      ))}
    </ul>
  );
}