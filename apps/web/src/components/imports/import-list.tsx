"use client";

import { FileUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListImportJobs } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ImportJobItem, ImportJobListParams } from "@/lib/sdk-types";
import {
  ACTIVE_IMPORT_STATUSES,
  IMPORT_STATUS_LABELS,
  IMPORT_TYPE_LABELS,
} from "@/lib/validators";

const ACTIVE_STATUSES: ImportJobItem["status"][] = [
  ...ACTIVE_IMPORT_STATUSES,
] as ImportJobItem["status"][];

export type ImportFilters = {
  page?: number;
  type?: ImportJobItem["type"];
  refreshKey?: number;
};

export function useImportJobs(filters: ImportFilters) {
  const [items, setItems] = useState<ImportJobItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params: ImportJobListParams = { page: filters.page ?? 1, limit: 20 };
    if (filters.type) {
      params.type = filters.type;
    }
    try {
      const data = await apiListImportJobs(params);
      setItems(data.data);
      setMeta(data.meta ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      setItems([]);
      setMeta(null);
      setError("No se pudieron cargar las importaciones.");
    }
  }, [filters.page, filters.type]);

  useEffect(() => {
    let cancelled = false;

    async function loadOnce() {
      setError(null);
      const params: ImportJobListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.type) {
        params.type = filters.type;
      }
      try {
        const data = await apiListImportJobs(params);
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
        setError("No se pudieron cargar las importaciones.");
      }
    }

    void loadOnce();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.type, filters.refreshKey]);

  const hasActive = items?.some((item) => ACTIVE_STATUSES.includes(item.status)) ?? false;

  useEffect(() => {
    if (!hasActive) {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [hasActive, load]);

  return { items, meta, error };
}

export function ImportStatusBadge({ status }: { status: ImportJobItem["status"] }) {
  const variant =
    status === "COMPLETED"
      ? "default"
      : status === "FAILED" || status === "CANCELLED"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{IMPORT_STATUS_LABELS[status]}</Badge>;
}

type ImportListProps = {
  items: ImportJobItem[] | null;
  error: string | null;
  onSelect: (item: ImportJobItem) => void;
};

export function ImportList({ items, error, onSelect }: ImportListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando importaciones">
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
      <EmptyState icon={FileUp} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileUp}
        title="Sin importaciones"
        description="Subí tu primer archivo de clientes, productos o compras para empezar."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de importaciones">
      {items.map((item) => (
        <li key={item.uuid}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{item.fileName}</p>
                <Badge variant="outline">{IMPORT_TYPE_LABELS[item.type]}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(item.createdAt)} ·{" "}
                {formatNumber(item.processedRecords)} de {formatNumber(item.totalRecords)} filas
                {item.errorRecords > 0 ? ` · ${formatNumber(item.errorRecords)} errores` : ""}
              </p>
            </div>
            <ImportStatusBadge status={item.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}