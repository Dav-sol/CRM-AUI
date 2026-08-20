"use client";

import { Workflow } from "lucide-react";
import { useEffect, useState } from "react";

import { AutomationActions } from "@/components/automations/automation-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListAutomations } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AutomationItem, AutomationListParams } from "@/lib/sdk-types";
import { AUTOMATION_STATUS_LABELS } from "@/lib/validators";

export type AutomationFilters = {
  page?: number;
  status?: AutomationItem["status"];
  refreshKey?: number;
};

export function useAutomations(filters: AutomationFilters) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: AutomationListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.status) {
        params.status = filters.status;
      }
      try {
        const data = await apiListAutomations(params);
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
        setError("No se pudieron cargar las automatizaciones.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.status, filters.refreshKey]);

  return { items, meta, error };
}

export function AutomationStatusBadge({ status }: { status: AutomationItem["status"] }) {
  const variant =
    status === "EXECUTED"
      ? "default"
      : status === "CANCELLED" || status === "ERROR"
        ? "destructive"
        : status === "PAUSED"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{AUTOMATION_STATUS_LABELS[status]}</Badge>;
}

type AutomationListProps = {
  items: AutomationItem[] | null;
  error: string | null;
  onChanged: () => void;
  onSelect: (automation: AutomationItem) => void;
};

export function AutomationList({ items, error, onChanged, onSelect }: AutomationListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando automatizaciones">
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
      <EmptyState icon={Workflow} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="Sin automatizaciones"
        description="Las campañas generan automatizaciones al activarse. Van a aparecer acá."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de automatizaciones">
      {items.map((automation) => (
        <li
          key={automation.uuid}
          className="flex items-center gap-4 px-4 py-3"
          role="button"
          tabIndex={0}
          aria-label="Ver detalle de la automatización"
          onClick={() => onSelect(automation)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(automation);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              Programada {formatDateTime(automation.scheduledDate)}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {automation.commercialCycleId
                ? `Ciclo comercial ${automation.commercialCycleId.slice(0, 8)} · `
                : "Sin ciclo comercial · "}
              {automation.executedDate
                ? `ejecutada ${formatDateTime(automation.executedDate)}`
                : `creada ${formatDateTime(automation.createdAt)}`}
            </p>
          </div>
          <AutomationStatusBadge status={automation.status} />
          <AutomationActions uuid={automation.uuid} status={automation.status} onChanged={onChanged} />
        </li>
      ))}
    </ul>
  );
}