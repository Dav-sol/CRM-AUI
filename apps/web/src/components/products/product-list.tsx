"use client";

import { Package } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListProducts } from "@/lib/api";
import { formatDate } from "@/lib/format";
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
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: ProductListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.status) {
        params.status = filters.status;
      }
      try {
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
  }, [filters.page, filters.search, filters.status, filters.refreshKey]);

  return { items, meta, error };
}

export function ProductStatusBadge({ status }: { status: ProductItem["status"] }) {
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

export function ProductList({ items, error, onChanged }: ProductListProps) {
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
      <EmptyState icon={Package} title="Error al cargar" description={error} className="py-8" />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Sin productos"
        description="Cuando cargues tu catálogo de productos, los vas a ver acá."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de productos">
      {items.map((product) => (
        <li key={product.uuid} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{product.name}</p>
              {product.category && (
                <Badge variant="outline">{product.category}</Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="font-mono">{product.code}</span>
              {product.createdAt ? ` · cargado ${formatDate(product.createdAt)}` : ""}
            </p>
          </div>
          <ProductStatusBadge status={product.status} />
          <ProductActions product={product} onChanged={onChanged} />
        </li>
      ))}
    </ul>
  );
}