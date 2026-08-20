"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { ImportDetailSheet } from "@/components/imports/import-detail-sheet";
import {
  ImportList,
  useImportJobs,
  type ImportFilters,
} from "@/components/imports/import-list";
import { ImportUploadSheet } from "@/components/imports/import-upload-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportJobItem } from "@/lib/sdk-types";

const TYPE_TABS: { label: string; value: ImportFilters["type"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Clientes", value: "CUSTOMERS" },
  { label: "Productos", value: "PRODUCTS" },
  { label: "Compras", value: "PURCHASES" },
];

export function ImportsIndexPage() {
  const [type, setType] = useState<ImportFilters["type"]>(undefined);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<ImportJobItem | null>(null);
  const { items, meta, error } = useImportJobs({ page, type, refreshKey });

  const totalPages = meta?.pages ?? 1;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Importaciones</h1>
          <p className="text-sm text-muted-foreground">
            {meta ? `${meta.total} importaciones` : "Subí tus archivos de clientes, productos y compras."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw />
            Actualizar
          </Button>
          <ImportUploadSheet onSaved={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={type === tab.value}
              onClick={() => {
                setType(tab.value);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                type === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Los duplicados se actualizan automáticamente por su clave natural.
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        <ImportList items={items} error={error} onSelect={setSelected} />
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
            </Button>
          </div>
        </div>
      )}

      <ImportDetailSheet
        job={selected}
        onClose={() => setSelected(null)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}