"use client";

import { ArrowUpDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50";

export type SortOption = {
  value: string;
  label: string;
};

type ListToolbarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  sort?: string;
  sortOptions?: SortOption[];
  onSortChange?: (value: string) => void;
  filters?: Array<{
    value?: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    "aria-label"?: string;
  }>;
  /**
   * Extra cleanup run when "Limpiar" is pressed, besides clearing the controls
   * above. Screens use it to drop the global filters (header) they display, so
   * the button clears everything the screen is showing.
   */
  onClearAll?: () => void;
  children?: React.ReactNode;
};

/**
 * Layout + primitives for list toolbars: search, filter selects, sort and any
 * extra controls (date ranges, refresh). Consistent across all screens.
 */
export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  sort,
  sortOptions = [],
  onSortChange,
  filters = [],
  onClearAll,
  children,
}: ListToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearchChange && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchValue ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 w-48 rounded-md border border-border/60 bg-background pl-8 pr-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50"
          />
        </div>
      )}

      {filters.map((filter, index) => (
        <select
          key={index}
          value={filter.value ?? ""}
          onChange={(event) => filter.onChange(event.target.value)}
          className={cn(selectClass, "appearance-none")}
          aria-label={filter["aria-label"]}
        >
          <option value="">
            {filter.placeholder ?? "Todos"}
          </option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      {children}

      {sortOptions.length > 0 && onSortChange && (
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <select
            value={sort ?? ""}
            onChange={(event) => onSortChange(event.target.value)}
            className={cn(selectClass, "appearance-none")}
            aria-label="Ordenar"
          >
            <option value="">Orden</option>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {((searchValue && searchValue !== "") ||
        (sort && sort !== "") ||
        filters.some((filter) => filter.value && filter.value !== "")) && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            onSearchChange?.("");
            onSortChange?.("");
            for (const filter of filters) {
              filter.onChange("");
            }
            onClearAll?.();
          }}
          aria-label="Limpiar filtros"
        >
          <X className="size-3.5" aria-hidden="true" />
          Limpiar
        </Button>
      )}
    </div>
  );
}