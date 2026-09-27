"use client";

import { ChevronDown, ChevronRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGetCampaign, apiListCampaigns } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { renderPreviewMessage, stageMomentLabel } from "@/lib/preview";
import type { CampaignItem, CampaignListParams } from "@/lib/sdk-types";
import { getStateMeta } from "@/lib/status";
import { CAMPAIGN_TYPE_LABELS } from "@/lib/validators";

export type CampaignFilters = {
  page?: number;
  search?: string;
  status?: CampaignItem["status"];
  type?: string;
  sort?: string;
  createdFrom?: string;
  createdTo?: string;
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
      if (filters.type) {
        params.type = filters.type as NonNullable<CampaignListParams>["type"];
      }
      if (filters.sort) {
        params.sort = filters.sort;
      }
      if (filters.createdFrom) {
        params.createdFrom = filters.createdFrom;
      }
      if (filters.createdTo) {
        params.createdTo = filters.createdTo;
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
  }, [
    filters.page,
    filters.search,
    filters.status,
    filters.type,
    filters.sort,
    filters.createdFrom,
    filters.createdTo,
    filters.refreshKey,
  ]);

  return { items, meta, error };
}

export function CampaignStatusBadge({ status }: { status: CampaignItem["status"] }) {
  const meta = getStateMeta("campaign", status);
  return (
    <Badge variant={meta.variant} title={meta.meaning}>
      {meta.label}
    </Badge>
  );
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
    // Fase 6 (T21): fechas legibles (no ISO crudo).
    const from = segment.purchaseFrom
      ? `desde ${formatDate(segment.purchaseFrom)}`
      : "";
    const to = segment.purchaseTo
      ? `hasta ${formatDate(segment.purchaseTo)}`
      : "";
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
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [details, setDetails] = useState<
    Record<string, Awaited<ReturnType<typeof apiGetCampaign>>>
  >({});

  async function toggle(campaign: CampaignItem) {
    if (expandedUuid === campaign.uuid) {
      setExpandedUuid(null);
      return;
    }
    setExpandedUuid(campaign.uuid);
    if (details[campaign.uuid]) {
      return;
    }
    try {
      const detail = await apiGetCampaign(campaign.uuid);
      setDetails((current) => ({ ...current, [campaign.uuid]: detail }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
    }
  }

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
        description="Cuando crees campañas de seguimiento, las vas a ver aquí."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de campañas">
      {items.map((campaign) => {
        const expanded = expandedUuid === campaign.uuid;
        const detail = details[campaign.uuid];
        const emptySoon =
          campaign.automationCount === 0 &&
          campaign.startAt &&
          new Date(campaign.startAt).getTime() <= now + 7 * 86_400_000 &&
          (campaign.status === "APPROVED" || campaign.status === "DRAFT");
        return (
          <li key={campaign.uuid} className="px-5 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void toggle(campaign)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                aria-expanded={expanded}
              >
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {expanded ? (
                    <ChevronDown className="size-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-base font-semibold">
                      {campaign.name}
                    </span>
                    <Badge variant="outline">
                      {CAMPAIGN_TYPE_LABELS[campaign.type]}
                    </Badge>
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">
                    {segmentSummary(campaign.segment)} ·{" "}
                    {campaign.automationCount > 0
                      ? `${campaign.automationCount} automatizaciones, ${campaign.executedCount} ejecutadas`
                      : "sin automatizaciones aún"}
                    {campaign.startAt
                      ? ` · inicia ${formatDate(campaign.startAt)}`
                      : ""}
                  </span>
                  {emptySoon && (
                    <span className="mt-1 block text-xs font-medium text-destructive">
                      Está por iniciar sin automatizaciones
                    </span>
                  )}
                </span>
              </button>
              <CampaignStatusBadge status={campaign.status} />
              <CampaignActions
                uuid={campaign.uuid}
                status={campaign.status}
                onChanged={onChanged}
              />
            </div>

            {expanded && (
              <div className="mt-3 ml-6 rounded-lg border border-border/40 bg-muted/30 p-3 text-sm">
                {!detail ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3.5 w-1/2" />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Segmento</p>
                      <p className="font-medium">{segmentSummary(detail.segment)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Inicio</p>
                      <p className="font-medium">
                        {detail.startAt ? formatDate(detail.startAt) : "No programada"}
                      </p>
                    </div>
                    {detail.followUpSequence && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Journey</p>
                        <ul className="mt-1 space-y-1.5">
                          {(detail.followUpSequence.stages ?? []).map((stage) => (
                            <li
                              key={stage.uuid}
                              className="rounded-md border border-border/60 bg-card/60 p-2"
                            >
                              <p className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium">{stage.name}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {stageMomentLabel(stage.anchor, stage.offsetDays)}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                                {renderPreviewMessage(stage.template)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Resultados</p>
                      <p className="font-medium">
                        {formatNumber(detail.automationCount)} automatizaciones ·{" "}
                        {formatNumber(detail.delivered)} entregados ·{" "}
                        {formatNumber(detail.responded)} respondidos
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comercial</p>
                      <p className="font-medium">
                        {formatNumber(detail.sales)} ventas · $
                        {formatCurrency(detail.revenue)} ingresos
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Costo{" "}
                        {detail.channel === "SMS" ? "SMS" : "estimado"} $
                        {formatCurrency(detail.estimatedCost)} · ROI{" "}
                        {detail.roi !== null && detail.roi !== undefined
                          ? `${(detail.roi * 100).toFixed(0)}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href={`/campaigns/${campaign.uuid}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Abrir campaña →
                  </Link>
                  {(campaign.status === "DRAFT" || campaign.status === "APPROVED" || campaign.status === "ACTIVE") && (
                    <Link
                      href={`/campaigns/editor/${campaign.uuid}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Editar
                    </Link>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}