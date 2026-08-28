"use client";

import { Package } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListProducts } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { ProductItem, ProductListParams } from "@/lib/sdk-types";
import { PRODUCT_STATUS_LABELS } from "@/lib/validators";
import { ProductActions } from "./product-actions";

export type ProductFilters = {
  page?: number;
  search?: string;
  status?: ProductItem["status"];
  refreshKey?: number;
};

export function useProducts(filters: ProductFilters) {
  const [items, setItems] = useState<ProductItem[] | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    pages: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = !filters.search?.trim() && !filters.status;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        if (grouped) {
          // Complete grouped catalog: load every page so the brand sections
          // are not fragmented by pagination.
          const all: ProductItem[] = [];
          let page = 1;
          let pages = 1;
          do {
            const data = await apiListProducts({ page, limit: 100 });
            all.push(...data.data);
            pages = data.meta?.pages ?? 1;
            page++;
            if (cancelled) {
              return;
            }
          } while (page <= pages);
          if (cancelled) {
            return;
          }
          setItems(all);
          setMeta({ page: 1, pages: 1, total: all.length });
          return;
        }
        const params: ProductListParams = {
          page: filters.page ?? 1,
          limit: 20,
        };
        if (filters.search?.trim()) {
          params.search = filters.search.trim();
        }
        if (filters.status) {
          params.status = filters.status;
        }
        const data = await apiListProducts(params);
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
        setError("No se pudieron cargar los productos.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    filters.page,
    filters.search,
    filters.status,
    filters.refreshKey,
    grouped,
  ]);

  return { items, meta, error };
}

export function ProductStatusBadge({
  status,
}: {
  status: ProductItem["status"];
}) {
  return (
    <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>
      {PRODUCT_STATUS_LABELS[status]}
    </Badge>
  );
}

type ProductListProps = {
  items: ProductItem[] | null;
  error: string | null;
  onChanged: () => void;
};

// Fase 6 (T20-lite): clasifica por categoría Y nombre para que los items de
// marcas principales con categoría genérica (p. ej. "GENERAL") no caigan en
// "Otras marcas". La fuente de verdad definitiva (campo brand) queda pendiente
// de Human Gate (datos).
function normalizeFamily(
  category: string | null | undefined,
  name: string | null | undefined,
): string {
  const source = `${category ?? ""} ${name ?? ""}`.trim().toUpperCase();
  if (source.includes("MAC")) return "MAC";
  if (source.includes("WILLARD")) return "WILLARD";
  if (source.includes("DUNCAN")) return "DUNCAN";
  return "Otras marcas";
}

const FAMILY_ORDER = ["MAC", "WILLARD", "DUNCAN", "Otras marcas"];

export function ProductList({ items, error, onChanged }: ProductListProps) {
  // Fase 6 (T22): tope por familia para no renderizar el catálogo completo.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const FAMILY_PAGE_SIZE = 15;
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando productos">
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
        icon={Package}
        title="Error al cargar"
        description={error}
        className="py-8"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Sin productos"
        description="Cuando cargues tu catálogo de productos, los vas a ver aquí."
        className="py-8"
      />
    );
  }

  const groups = new Map<string, ProductItem[]>();
  for (const product of items) {
    const family = normalizeFamily(product.category, product.name);
    const bucket = groups.get(family) ?? [];
    bucket.push(product);
    groups.set(family, bucket);
  }
  const naturalCompare = new Intl.Collator(undefined, { numeric: true })
    .compare;
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => naturalCompare(a.code, b.code));
  }
  const families = [...groups.entries()].sort(
    (a, b) => FAMILY_ORDER.indexOf(a[0]) - FAMILY_ORDER.indexOf(b[0]),
  );

  return (
    <div className="space-y-4 p-3" aria-label="Lista de productos por familia">
      {families.map(([family, familyItems]) => (
        <section key={family}>
          <div className="flex items-center justify-between gap-2 px-2">
            <h2 className="text-sm font-semibold tracking-tight">{family}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {familyItems.length}{" "}
              {familyItems.length === 1 ? "producto" : "productos"}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
            {familyItems.slice(0, expanded[family] ? undefined : FAMILY_PAGE_SIZE).map((product) => (
              <li
                key={product.uuid}
                className="flex items-center gap-4 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {product.code}
                    </span>
                  </div>
                </div>
                {product.warrantyMonths ? (
                  <Badge variant="default" className="shrink-0">
                    {product.warrantyMonths} meses de garantía
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-muted-foreground"
                  >
                    Sin garantía
                  </Badge>
                )}
                {product.price ? (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    ${formatCurrency(product.price)}
                  </span>
                ) : null}
                <ProductStatusBadge status={product.status} />
                <ProductActions product={product} onChanged={onChanged} />
              </li>
            ))}
          </ul>
          {familyItems.length > FAMILY_PAGE_SIZE && (
            <button
              type="button"
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [family]: !current[family],
                }))
              }
              className="mt-1.5 px-2 text-xs font-medium text-primary hover:underline"
            >
              {expanded[family]
                ? "Mostrar menos"
                : `Ver ${familyItems.length - FAMILY_PAGE_SIZE} más`}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
