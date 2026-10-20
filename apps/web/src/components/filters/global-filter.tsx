"use client";

import { Filter, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFilters, type GlobalFilters } from "@/lib/filter-provider";

/**
 * "Por vencer" and "Vencida" are the only windows the customers endpoint can
 * express (specs/023-filters-v1 Q6/C-01). There is no "has a valid warranty"
 * parameter, so that option is not offered rather than approximated.
 */
const WARRANTY_OPTIONS: {
  label: string;
  value: NonNullable<GlobalFilters["warrantyStatus"]>;
}[] = [
  { label: "Todas", value: "all" },
  { label: "Por vencer", value: "expiring" },
  { label: "Vencida", value: "expired" },
];

const inputClass =
  "h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50";

/**
 * Global filter panel (specs/023-filters-v1 FR-005): every control edits a
 * draft. Nothing is applied, requested or counted in the badge until
 * "Aplicar filtros", and closing without applying drops the draft.
 */
export function GlobalFilter() {
  const {
    filters,
    draft,
    startDraft,
    discardDraft,
    setDraftFilter,
    applyDraft,
    resetFilters,
    activeCount,
  } = useFilters();
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      startDraft();
    } else {
      discardDraft();
    }
  }

  function handleApply() {
    applyDraft();
    setOpen(false);
  }

  function handleClear() {
    resetFilters();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        <Filter className="size-3.5" />
        Filtros
        {activeCount > 0 && (
          <span
            data-testid="global-filter-count"
            className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80">
        <p className="text-xs font-semibold text-muted-foreground">
          Filtros globales
        </p>

        {/* City filter: free text, the API matches with `contains` */}
        <div className="mt-2">
          <label
            htmlFor="global-filter-city"
            className="text-xs font-medium text-muted-foreground"
          >
            Ciudad
          </label>
          <input
            id="global-filter-city"
            type="text"
            value={draft.city ?? ""}
            onChange={(event) => setDraftFilter("city", event.target.value)}
            placeholder="Todas las ciudades"
            maxLength={200}
            className={`${inputClass} mt-1`}
          />
        </div>

        {/* Warranty filter */}
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">Garantía</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {WARRANTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraftFilter("warrantyStatus", option.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  (draft.warrantyStatus ?? "all") === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range: applied per screen (created, purchase or scheduled date).
            Native date inputs instead of the toolbar DateRangePicker, which is
            itself a popover and would close this panel on interaction. */}
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">Fechas</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="global-filter-date-from"
              type="date"
              aria-label="Desde"
              value={draft.dateFrom ?? ""}
              onChange={(event) =>
                setDraftFilter("dateFrom", event.target.value)
              }
              className={inputClass}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              id="global-filter-date-to"
              type="date"
              aria-label="Hasta"
              value={draft.dateTo ?? ""}
              onChange={(event) => setDraftFilter("dateTo", event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={handleApply}
            disabled={
              (draft.city ?? "") === (filters.city ?? "") &&
              (draft.warrantyStatus ?? "all") ===
                (filters.warrantyStatus ?? "all") &&
              (draft.dateFrom ?? "") === (filters.dateFrom ?? "") &&
              (draft.dateTo ?? "") === (filters.dateTo ?? "")
            }
          >
            Aplicar filtros
          </Button>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleClear}
              aria-label="Limpiar filtros"
            >
              <X className="size-3.5" aria-hidden="true" />
              Limpiar
            </Button>
          )}
        </div>
        {activeCount > 0 && (
          <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <RotateCcw className="size-3" aria-hidden="true" />
            {activeCount} filtro{activeCount === 1 ? "" : "s"} aplicado
            {activeCount === 1 ? "" : "s"}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
