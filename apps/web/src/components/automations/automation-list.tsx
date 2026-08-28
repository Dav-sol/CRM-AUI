"use client";

import { Workflow } from "lucide-react";
import { useEffect, useState } from "react";

import { AutomationActions } from "@/components/automations/automation-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListAutomations } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { renderPreviewMessage } from "@/lib/preview";
import { getStateMeta } from "@/lib/status";
import type { AutomationItem, AutomationListParams } from "@/lib/sdk-types";

export type AutomationFilters = {
  page?: number;
  status?: AutomationItem["status"];
  search?: string;
  sort?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  refreshKey?: number;
};

export function useAutomations(filters: AutomationFilters) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    pages: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: AutomationListParams = {
        page: filters.page ?? 1,
        limit: 20,
      };
      if (filters.status) {
        params.status = filters.status;
      }
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.sort) {
        params.sort = filters.sort;
      }
      if (filters.scheduledFrom) {
        params.scheduledFrom = filters.scheduledFrom;
      }
      if (filters.scheduledTo) {
        params.scheduledTo = filters.scheduledTo;
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
  }, [
    filters.page,
    filters.status,
    filters.search,
    filters.sort,
    filters.scheduledFrom,
    filters.scheduledTo,
    filters.refreshKey,
  ]);

  return { items, meta, error };
}

export function useUpcomingAutomations(refreshKey: number) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const data = await apiListAutomations({
          page: 1,
          limit: 4,
          status: "SCHEDULED",
          scheduledFrom: new Date().toISOString(),
          scheduledTo: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          sort: "scheduledDate",
        });
        if (!cancelled) {
          setItems(data.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setItems([]);
        setError("No se pudieron cargar las próximas automatizaciones.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { items, error };
}

// Rails priorizadas (playbook §32): Recompra / Garantías próximas, acotadas.
export function useAutomationsRail(
  params: NonNullable<AutomationListParams>,
  refreshKey: number,
) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiListAutomations({
          page: 1,
          limit: 4,
          purpose: params.purpose,
          status: params.status,
          sort: params.sort,
          scheduledFrom: params.scheduledFrom,
          scheduledTo: params.scheduledTo,
        });
        if (!cancelled) {
          setItems(data.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          setItems([]);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    refreshKey,
    params.purpose,
    params.status,
    params.sort,
    params.scheduledFrom,
    params.scheduledTo,
  ]);

  return { items };
}

// Garantías por vencer (Fase 4): etapas warranty transaccionales entre 15 y 60
// días, para no duplicar el rail "Próximas" (≤14 días).
export function useWarrantiesSoonRail(refreshKey: number) {
  const [items, setItems] = useState<AutomationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiListAutomations({
          page: 1,
          limit: 4,
          purpose: "TRANSACTIONAL",
          status: "SCHEDULED",
          scheduledFrom: new Date(Date.now() + 15 * 86_400_000).toISOString(),
          scheduledTo: new Date(Date.now() + 60 * 86_400_000).toISOString(),
          sort: "scheduledDate",
        });
        if (!cancelled) {
          setItems(data.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          setItems([]);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { items };
}

export function AutomationStatusBadge({
  status,
}: {
  status: AutomationItem["status"];
}) {
  const meta = getStateMeta("automation", status);
  return (
    <Badge variant={meta.variant} title={meta.meaning}>
      {meta.label}
    </Badge>
  );
}

type AutomationListProps = {
  items: AutomationItem[] | null;
  error: string | null;
  onChanged: () => void;
  onSelect: (automation: AutomationItem) => void;
};

export function AutomationList({
  items,
  error,
  onChanged,
  onSelect,
}: AutomationListProps) {
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
      <EmptyState
        icon={Workflow}
        title="Error al cargar"
        description={error}
        className="py-8"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="Sin automatizaciones"
        description="Las campañas generan automatizaciones al activarse. Van a aparecer aquí."
        className="py-8"
      />
    );
  }

  return (
    <div
      className="grid gap-3 p-4"
      aria-label="Lista de automatizaciones"
    >
      {items.map((automation) => (
        <button
          key={automation.uuid}
          type="button"
          role="button"
          aria-label="Ver detalle de la automatización"
          onClick={() => onSelect(automation)}
          className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Workflow className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">
                  {automation.customer?.name ?? "Cliente"}
                </p>
                <p className="truncate text-sm font-medium text-foreground/80">
                  {automation.stageName ?? automation.campaign?.name ?? "Seguimiento"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {automation.productName}
                  {automation.campaign?.name
                    ? ` · ${automation.campaign.name}`
                    : ""}
                </p>
              </div>
            </div>
            <AutomationStatusBadge status={automation.status} />
          </div>
          <div>
            <p className="text-sm font-medium">
              Programada para {formatDateTime(automation.scheduledDate)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {automation.executedDate
                ? `Ejecutada ${formatDateTime(automation.executedDate)}`
                : `Creada ${formatDateTime(automation.createdAt)}`}
            </p>
            {automation.messageTemplate && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {renderPreviewMessage(automation.messageTemplate)}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
            <span className="text-xs text-muted-foreground">
              {automation.status === "SCHEDULED"
                ? "Programada"
                : automation.status}
            </span>
            <AutomationActions
              uuid={automation.uuid}
              status={automation.status}
              onChanged={onChanged}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
