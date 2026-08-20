"use client";

import { Layers } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGetCommercialCycle, apiListCommercialCycles } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  CommercialCycleDetail,
  CommercialCycleItem,
  CommercialCycleListParams,
} from "@/lib/sdk-types";
import { COMMERCIAL_CYCLE_STATUS_LABELS } from "@/lib/validators";

export type CommercialCycleFilters = {
  page?: number;
  status?: CommercialCycleItem["status"];
  refreshKey?: number;
};

export function useCommercialCycles(filters: CommercialCycleFilters) {
  const [items, setItems] = useState<CommercialCycleItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: CommercialCycleListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.status) {
        params.status = filters.status;
      }
      try {
        const data = await apiListCommercialCycles(params);
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
        setError("No se pudieron cargar los ciclos comerciales.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.status, filters.refreshKey]);

  return { items, meta, error };
}

export function CommercialCycleStatusBadge({ status }: { status: CommercialCycleItem["status"] }) {
  const variant =
    status === "ACTIVE"
      ? "default"
      : status === "CANCELLED"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{COMMERCIAL_CYCLE_STATUS_LABELS[status]}</Badge>;
}

type CommercialCycleListProps = {
  items: CommercialCycleItem[] | null;
  error: string | null;
  onSelect: (cycle: CommercialCycleItem) => void;
};

export function CommercialCycleList({ items, error, onSelect }: CommercialCycleListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando ciclos comerciales">
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
      <EmptyState icon={Layers} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Sin ciclos comerciales"
        description="Los ciclos se crean a partir de compras con seguimiento automático."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de ciclos comerciales">
      {items.map((cycle) => (
        <li
          key={cycle.uuid}
          className="flex items-center gap-4 px-4 py-3"
          role="button"
          tabIndex={0}
          aria-label="Ver detalle del ciclo comercial"
          onClick={() => onSelect(cycle)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(cycle);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Ciclo {cycle.uuid.slice(0, 8)}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Inicia {formatDate(cycle.startDate)} · compra {cycle.purchaseId.slice(0, 8)}
              {cycle.endDate ? ` · finaliza ${formatDate(cycle.endDate)}` : ""}
            </p>
          </div>
          <CommercialCycleStatusBadge status={cycle.status} />
        </li>
      ))}
    </ul>
  );
}

type CycleDetailSheetProps = {
  uuid: string | null;
  onClose: () => void;
};

type LoadedState =
  | { uuid: string; detail: CommercialCycleDetail; error: null }
  | { uuid: string; detail: null; error: string };

export function CycleDetailSheet({ uuid, onClose }: CycleDetailSheetProps) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);

  useEffect(() => {
    if (uuid === null) {
      return;
    }
    let cancelled = false;

    void apiGetCommercialCycle(uuid)
      .then((detail) => {
        if (!cancelled) {
          setLoaded({ uuid, detail, error: null });
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          return;
        }
        setLoaded({ uuid, detail: null, error: "No se pudo cargar el detalle del ciclo comercial." });
      });

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const state = loaded?.uuid === uuid ? loaded : null;

  return (
    <Sheet open={uuid !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Detalle de ciclo comercial</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!state ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : state.detail ? (
            <CycleDetailContent detail={state.detail} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CycleDetailContent({ detail }: { detail: CommercialCycleDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Estado</span>
        <CommercialCycleStatusBadge status={detail.status} />
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Fechas</span>
        <p className="font-medium">Inicia {formatDateTime(detail.startDate)}</p>
        {detail.endDate && (
          <p className="text-xs text-muted-foreground">
            Finaliza {formatDateTime(detail.endDate)}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Compra</span>
        <p className="font-medium">{detail.purchaseId.slice(0, 8)}</p>
      </div>
      <div className="space-y-2">
        <span className="text-muted-foreground">
          Automatizaciones ({detail.automations.length})
        </span>
        {detail.automations.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin automatizaciones.</p>
        ) : (
          <ul className="space-y-2">
            {detail.automations.map((automation) => (
              <li
                key={automation.uuid}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {formatDateTime(automation.scheduledDate)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {automation.uuid.slice(0, 8)}
                  </p>
                </div>
                <AutomationMiniBadge status={automation.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const AUTOMATION_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  SCHEDULED: "Programada",
  EXECUTED: "Ejecutada",
  CANCELLED: "Cancelada",
  ERROR: "Error",
  PAUSED: "Pausada",
};

function AutomationMiniBadge({ status }: { status: string }) {
  const variant =
    status === "EXECUTED"
      ? "default"
      : status === "CANCELLED" || status === "ERROR"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{AUTOMATION_LABELS[status] ?? status}</Badge>;
}