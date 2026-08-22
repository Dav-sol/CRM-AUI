"use client";

import { ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListPurchases } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PurchaseItem, PurchaseListParams } from "@/lib/sdk-types";

export type PurchaseFilters = {
  page?: number;
  search?: string;
  status?: PurchaseItem["status"];
  dateFrom?: string;
  dateTo?: string;
  refreshKey?: number;
};

const STATUS_LABELS: Record<PurchaseItem["status"], string> = {
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
};

export function usePurchases(filters: PurchaseFilters) {
  const [items, setItems] = useState<PurchaseItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: PurchaseListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.status) {
        params.status = filters.status;
      }
      if (filters.dateFrom) {
        params.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        params.dateTo = filters.dateTo;
      }
      try {
        const data = await apiListPurchases(params);
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
        setError("No se pudieron cargar las compras.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.search, filters.status, filters.dateFrom, filters.dateTo, filters.refreshKey]);

  return { items, meta, error };
}

export function PurchaseStatusBadge({ status }: { status: PurchaseItem["status"] }) {
  return (
    <Badge
      variant={
        status === "COMPLETED" ? "default" : status === "REFUNDED" ? "secondary" : "destructive"
      }
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function formatValue(value: string): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

type PurchaseListProps = {
  items: PurchaseItem[] | null;
  error: string | null;
};

export function PurchaseList({ items, error }: PurchaseListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando compras">
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
        icon={ShoppingCart}
        title="Error al cargar"
        description={error}
        className="py-8"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Sin compras"
        description="Cuando cargues compras de tus clientes, las vas a ver acá."
        className="py-8"
      />
    );
  }

  const groups = new Map<string, PurchaseItem[]>();
  for (const purchase of items) {
    const key = format(new Date(purchase.purchaseDate), "yyyy-MM");
    const bucket = groups.get(key) ?? [];
    bucket.push(purchase);
    groups.set(key, bucket);
  }
  const months = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4 p-3" aria-label="Lista de compras por mes">
      {months.map(([monthKey, monthItems]) => {
        const monthLabel = format(new Date(`${monthKey}-01T00:00:00.000Z`), "MMMM yyyy", {
          locale: es,
        });
        const monthTotal = monthItems.reduce((acc, p) => acc + Number(p.value), 0);
        return (
          <section key={monthKey}>
            <div className="flex items-center justify-between gap-2 px-2">
              <h2 className="text-sm font-semibold tracking-tight capitalize">{monthLabel}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {monthItems.length} compras · ${formatValue(String(monthTotal))}
              </span>
            </div>
            <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
              {monthItems.map((purchase) => (
                <li key={purchase.id} className="flex items-center gap-4 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {purchase.invoiceNumber}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {purchase.customer.name} · {purchase.product.name}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(purchase.purchaseDate)} · {purchase.quantity}{" "}
                      {purchase.quantity === 1 ? "unidad" : "unidades"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">${formatValue(purchase.value)}</p>
                  </div>
                  <PurchaseStatusBadge status={purchase.status} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}