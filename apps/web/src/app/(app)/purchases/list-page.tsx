"use client";

import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { CreatePurchaseSheet } from "@/components/purchases/create-purchase-sheet";
import {
  PurchaseList,
  formatValue,
  usePurchases,
  type PurchaseFilters,
} from "@/components/purchases/purchase-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiPurchaseStats } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: PurchaseFilters["status"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Completadas", value: "COMPLETED" },
  { label: "Canceladas", value: "CANCELLED" },
  { label: "Reembolsadas", value: "REFUNDED" },
];

const RANGES = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
  { key: "all", label: "Todo" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function rangeDates(key: RangeKey): { dateFrom?: string; dateTo?: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (key === "today") return { dateFrom: to, dateTo: to };
  if (key === "7d") {
    const from = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    return { dateFrom: from, dateTo: to };
  }
  if (key === "30d") {
    const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    return { dateFrom: from, dateTo: to };
  }
  if (key === "month") {
    const now = new Date();
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { dateFrom: from, dateTo: to };
  }
  return {};
}

type Stats = Awaited<ReturnType<typeof apiPurchaseStats>>;

export function PurchasesIndexPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PurchaseFilters["status"]>(undefined);
  const [range, setRange] = useState<RangeKey>("30d");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  const { dateFrom, dateTo } = rangeDates(range);
  const { items, meta, error } = usePurchases({
    page,
    search,
    status,
    dateFrom,
    dateTo,
    refreshKey,
  });

  const totalPages = meta?.pages ?? 1;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { dateFrom: from, dateTo: to } = rangeDates(range);
      try {
        const data = await apiPurchaseStats({
          ...(from ? { dateFrom: from } : {}),
          ...(to ? { dateTo: to } : {}),
          ...(status ? { status } : {}),
        });
        if (cancelled) return;
        setStats(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return;
        setStats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, status]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-none flex-col p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">
            {meta ? `${meta.total} compras registradas` : "Historial de compras de tus clientes."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            Actualizar
          </Button>
          <CreatePurchaseSheet onCreated={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      {/* Panel de rango (Google Ads) */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Rango de fechas">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={range === item.key}
              onClick={() => {
                setRange(item.key);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                range === item.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                status === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form onSubmit={applySearch} className="relative ml-auto w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por número de factura…"
            className="pl-9"
            aria-label="Buscar compras"
            maxLength={100}
          />
        </form>
      </div>

      {/* KPIs globales */}
      {stats === null ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShoppingCart className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-lg font-semibold leading-tight">{stats.total}</dd>
              <dt className="text-xs text-muted-foreground">Compras</dt>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Boxes className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-lg font-semibold leading-tight">{stats.units}</dd>
              <dt className="text-xs text-muted-foreground">Unidades</dt>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Users className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-lg font-semibold leading-tight">{stats.customers}</dd>
              <dt className="text-xs text-muted-foreground">Clientes</dt>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-lg font-semibold leading-tight">{stats.activeWarranties}</dd>
              <dt className="text-xs text-muted-foreground">Garantías activas</dt>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShoppingCart className="size-4" aria-hidden="true" />
            </span>
            <div>
              <dd className="text-lg font-semibold leading-tight">
                ${formatValue(stats.totalValue)}
              </dd>
              <dt className="text-xs text-muted-foreground">Valor total</dt>
            </div>
          </div>
        </dl>
      )}

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        <PurchaseList items={items} error={error} />
      </div>

      {meta && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Página {meta.page} de {totalPages} · {meta.total} resultados
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || items === null}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || items === null}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}