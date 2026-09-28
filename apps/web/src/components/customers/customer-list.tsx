"use client";

import { MessageCircle, Phone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListConversations, apiListCustomers } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import {
  WARRANTY_EXPIRED_IN_DAYS,
  WARRANTY_EXPIRING_IN_DAYS,
  type GlobalFilters,
} from "@/lib/filter-provider";
import type { CustomerItem, CustomerListParams } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";

export type CustomerFilters = {
  page?: number;
  search?: string;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
  refreshKey?: number;
  /** Global filter: partial match over the city */
  city?: GlobalFilters["city"];
  /** Global filter: warranty window, translated into the API windows below */
  warrantyStatus?: GlobalFilters["warrantyStatus"];
};

export function useCustomers(filters: CustomerFilters) {
  const [items, setItems] = useState<CustomerItem[] | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    pages: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: CustomerListParams = { page: filters.page ?? 1, limit: 20 };
      if (filters.search?.trim()) {
        params.search = filters.search.trim();
      }
      if (filters.status) {
        params.status = filters.status as NonNullable<CustomerListParams>["status"];
      }
      if (filters.createdFrom) {
        params.createdFrom = filters.createdFrom;
      }
      if (filters.createdTo) {
        params.createdTo = filters.createdTo;
      }
      if (filters.sort) {
        params.sort = filters.sort;
      }
      if (filters.city?.trim()) {
        params.city = filters.city.trim();
      }
      // The warranty filter is a window, not a flag: "Por vencer" is the next
      // 30 days and "Vencida" the last two years (specs/023-filters-v1 Q6).
      if (filters.warrantyStatus === "expiring") {
        params.warrantyExpiringInDays = WARRANTY_EXPIRING_IN_DAYS;
      } else if (filters.warrantyStatus === "expired") {
        params.warrantyExpiredInDays = WARRANTY_EXPIRED_IN_DAYS;
      }
      try {
        const data = await apiListCustomers(params);
        if (!cancelled) {
          setItems(data.data);
          setMeta(data.meta ?? null);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return;
        setItems([]);
        setMeta(null);
        setError("No se pudieron cargar los clientes.");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [
    filters.page,
    filters.search,
    filters.status,
    filters.createdFrom,
    filters.createdTo,
    filters.sort,
    filters.city,
    filters.warrantyStatus,
    filters.refreshKey,
  ]);

  return { items, meta, error };
}

export function CustomerStatusBadge({
  status,
}: {
  status: CustomerItem["status"];
}) {
  const variant =
    status === "ACTIVE"
      ? "default"
      : status === "PENDING"
        ? "secondary"
        : status === "INACTIVE"
          ? "secondary"
          : "destructive";
  const label =
    status === "ACTIVE"
      ? "Activo"
      : status === "PENDING"
        ? "Pendiente"
        : status === "INACTIVE"
          ? "Inactivo"
          : "Bloqueado";
  return <Badge variant={variant}>{label}</Badge>;
}

type CustomerListProps = {
  items: CustomerItem[] | null;
  error: string | null;
};

export function CustomerList({ items, error }: CustomerListProps) {
  const [conversationMap, setConversationMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!items || items.length === 0) return;

    // One request per customer with a phone, issued in parallel and resolved in
    // a single state update. The conversations endpoint filters by a single
    // customerId, so this stays the cheapest correct shape until the customer
    // list itself carries the conversation (specs/023-filters-v1 C-05).
    const withPhone = items.filter((customer) => customer.phone);
    if (withPhone.length === 0) return;

    let cancelled = false;

    void (async () => {
      const found = await Promise.all(
        withPhone.map(async (customer) => {
          try {
            const data = await apiListConversations({ customerId: customer.uuid, limit: 1 });
            const conversation = data[0];
            return conversation
              ? ([customer.uuid, conversation.uuid] as const)
              : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const entry of found) {
        if (entry) next[entry[0]] = entry[1];
      }
      setConversationMap(next);
    })();

    return () => { cancelled = true; };
  }, [items]);
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
        description="Cuando cargues clientes, los vas a ver aquí."
        className="py-8"
      />
    );
  }

  return (
    <ul className="divide-y divide-border/60" aria-label="Lista de clientes">
      {items.map((customer) => (
        <li
          key={customer.id}
          className={cn("flex items-center gap-3 px-4 py-3")}
        >
          <Link
            href={`/customers/${customer.uuid}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {customer.name}
              </p>
              <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="size-3" />
                    {formatPhone(customer.phone)}
                  </span>
                )}
                {customer.city && (
                  <span>· {customer.city}</span>
                )}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <CustomerStatusBadge status={customer.status} />
            {customer.phone && conversationMap[customer.uuid] && (
              <Link
                href={`/conversations/${conversationMap[customer.uuid]}`}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-green-500/50 hover:bg-green-50 hover:text-green-600"
                title="Abrir conversación"
                onClick={(e) => e.stopPropagation()}
              >
                <MessageCircle className="size-4" />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
