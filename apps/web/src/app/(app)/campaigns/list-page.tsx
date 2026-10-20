"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CampaignList,
  useCampaigns,
  type CampaignFilters,
} from "@/components/campaigns/campaign-list";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: CampaignFilters["status"] }[] = [
  { label: "Activas", value: "ACTIVE" },
  { label: "Borradores", value: "DRAFT" },
  { label: "Todas", value: undefined },
];

export function CampaignsIndexPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetParam = searchParams.get("preset");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignFilters["status"]>(undefined);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, meta, error } = useCampaigns({
    page,
    search,
    status,
    sort: "",
    createdFrom: from,
    createdTo: to,
    refreshKey,
  });

  const totalPages = meta?.pages ?? 1;

  // Fase 1: el recomendador enlaza con ?preset=…; ahora abre el editor full-page.
  useEffect(() => {
    if (presetParam) {
      router.replace(`/campaigns/editor?preset=${encodeURIComponent(presetParam)}`);
    }
  }, [presetParam, router]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="w-full space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Campañas</h1>
          <p className="text-sm text-muted-foreground">
            {meta
              ? `${meta.total} seguimientos`
              : "Automatiza el contacto post-venta por garantía y recompra."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            Actualizar
          </Button>
          <Link
            href="/campaigns/editor"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <Plus className="size-4" />
            Crear campaña
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form onSubmit={applySearch} className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-9"
            aria-label="Buscar campañas"
            maxLength={100}
          />
        </form>
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
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSearchInput("");
              setPage(1);
            }}
          >
            Limpiar búsqueda
          </Button>
        )}
        <DateRangePicker
          value={{ from, to }}
          onChange={(range) => {
            setFrom(range.from);
            setTo(range.to);
            setPage(1);
          }}
        />
      </div>

      <div className="mt-4">
        <CampaignList
          items={items}
          error={error}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
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