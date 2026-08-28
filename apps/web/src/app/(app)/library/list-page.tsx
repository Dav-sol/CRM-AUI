"use client";

import { Library, Search } from "lucide-react";
import { useState, useEffect } from "react";

import { TemplateGrid } from "@/components/library/template-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiListTemplates } from "@/lib/api";
import type { TemplateItem } from "@/lib/sdk-types";

const TONE_OPTIONS = [
  { value: "all", label: "Todos los tonos" },
  { value: "PROFESSIONAL", label: "Profesional" },
  { value: "CARIBE_COMMERCIAL", label: "Comercial caribeño" },
  { value: "CARIBE_AUTHENTIC", label: "Caribe auténtico" },
] as const;

const ANGLE_OPTIONS = [
  { value: "all", label: "Todos los ángulos" },
  { value: "TRUST", label: "Confianza" },
  { value: "PREVENTION", label: "Prevención" },
  { value: "REPURCHASE", label: "Recompra" },
  { value: "LOYALTY", label: "Fidelización" },
  { value: "CONVERSATION", label: "Conversación" },
  { value: "CALM", label: "Tranquilidad" },
] as const;

const GROUP_OPTIONS = [
  { value: "all", label: "Todas las categorías" },
  { value: "Bienvenida y postventa", label: "Bienvenida y postventa" },
  { value: "Satisfacción y reseñas", label: "Satisfacción y reseñas" },
  { value: "Garantía y revisiones", label: "Garantía y revisiones" },
  { value: "Prevención D-60 / D-30", label: "Prevención" },
  { value: "Recompra y renovación", label: "Recompra y renovación" },
  { value: "Reactivación", label: "Reactivación" },
] as const;

export function LibraryIndexPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tone, setTone] = useState("all");
  const [angle, setAngle] = useState("all");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [templates, setTemplates] = useState<TemplateItem[] | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    pages: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = { page, limit: 24 };
        if (search.trim()) params.search = search.trim();
        if (tone !== "all") params.tone = tone;
        if (angle !== "all") params.angle = angle;
        if (group !== "all") params.group = group;

        const data = await apiListTemplates(params);
        if (!cancelled) {
          setTemplates(data.data);
          setMeta(data.meta);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error loading templates");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [search, tone, angle, group, page, refreshKey]);

  const totalPages = meta?.pages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">
            150 plantillas de copy organizadas por intención comercial y tono.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar plantilla..."
            value={searchInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") {
                setSearch(searchInput);
                setPage(1);
              }
            }}
            className="pl-9"
          />
        </div>

        <select
          value={tone}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setTone(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50"
        >
          {TONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={angle}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setAngle(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50"
        >
          {ANGLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={group}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setGroup(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50"
        >
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={Library}
          title="Error al cargar"
          description={error}
        />
      ) : !templates || templates.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Sin resultados"
          description="No se encontraron plantillas con estos filtros."
        />
      ) : (
        <>
          <TemplateGrid
            templates={templates}
            onCopied={() => setRefreshKey((k) => k + 1)}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {meta?.page ?? 1} de {totalPages} ({meta?.total ?? 0}{" "}
                plantillas)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
