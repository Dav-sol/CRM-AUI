"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";

import { EditSequenceSheet } from "@/components/follow-up-sequences/sequence-sheet";
import { CreateSequenceSheet } from "@/components/follow-up-sequences/sequence-sheet";
import { SequenceDetailSheet } from "@/components/follow-up-sequences/sequence-detail";
import {
  SequenceList,
  useFollowUpSequences,
  type SequenceFilters,
} from "@/components/follow-up-sequences/sequence-list";
import type { FollowUpSequenceItem } from "@/lib/sdk-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const WARRANTY_TABS: { label: string; value: SequenceFilters["warrantyMonths"] }[] = [
  { label: "Todas", value: undefined },
  { label: "12 meses", value: 12 },
  { label: "15 meses", value: 15 },
  { label: "18 meses", value: 18 },
  { label: "24 meses", value: 24 },
];

export function FollowUpSequencesIndexPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState<SequenceFilters["warrantyMonths"]>(undefined);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);
  const [editingSequence, setEditingSequence] = useState<FollowUpSequenceItem | null>(null);
  const { items, meta, error } = useFollowUpSequences({ page, search, warrantyMonths, refreshKey });

  const totalPages = meta?.pages ?? 1;

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Secuencias de seguimiento</h1>
          <p className="text-sm text-muted-foreground">
            {meta ? `${meta.total} secuencias` : "Gestión de secuencias de garantía."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            Actualizar
          </Button>
          <CreateSequenceSheet onCreated={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form onSubmit={applySearch} className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-9"
            aria-label="Buscar secuencias"
            maxLength={100}
          />
        </form>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {WARRANTY_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={warrantyMonths === tab.value}
              onClick={() => {
                setWarrantyMonths(tab.value);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                warrantyMonths === tab.value
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
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        <SequenceList
          items={items}
          error={error}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onSelect={(sequence) => setSelectedSequence(sequence.uuid)}
          onEdit={setEditingSequence}
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

      <SequenceDetailSheet
        uuid={selectedSequence}
        onClose={() => setSelectedSequence(null)}
      />
      <EditSequenceSheet
        key={editingSequence?.uuid ?? "new"}
        uuid={editingSequence?.uuid ?? null}
        onClose={() => setEditingSequence(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}