"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListCustomers } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CustomerItem, CustomerListParams } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";

export type CustomerFilters = {
  page?: number;
  search?: string;
  refreshKey?: number;
};

export function useCustomers(filters: CustomerFilters) {
  const [items, setItems] = useState<CustomerItem[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: CustomerListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      try {
        const data = await apiListCustomers(params);
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
        setError("No se pudieron cargar los clientes.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.page, filters.search, filters.refreshKey]);

  return { items, meta, error };
}

export function CustomerStatusBadge({ status }: { status: CustomerItem["status"] }) {
  return (
    <Badge
      variant={status === "ACTIVE" ? "default" : status === "INACTIVE" ? "secondary" : "destructive"}
    >
      {status === "ACTIVE" ? "Activo" : status === "INACTIVE" ? "Inactivo" : "Bloqueado"}
    </Badge>
  );
}

type CustomerListProps = {
  items: CustomerItem[] | null;
  error: string | null;
};

export function CustomerList({ items, error }: CustomerListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando clientes">
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
        icon={Users}
        title="Error al cargar"
        description={error}
        className="py-8"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin clientes"
        description="Cuando cargues clientes, los vas a ver acá. Usá el botón Nuevo cliente para crear uno."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de clientes">
      {items.map((customer) => (
        <li
          key={customer.id}
          className={cn("flex items-center gap-4 px-4 py-3")}
        >
          <Link
            href={`/customers/${customer.uuid}`}
            className="flex min-w-0 flex-1 items-center gap-4"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {customer.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {customer.codcli}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[customer.phone, customer.email].filter(Boolean).join(" · ") || "Sin contacto"}
                {customer.city ? ` · ${customer.city}` : ""}
              </p>
            </div>
            <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
              {formatDate(customer.createdAt)}
            </div>
          </Link>
          <CustomerStatusBadge status={customer.status} />
        </li>
      ))}
    </ul>
  );
}