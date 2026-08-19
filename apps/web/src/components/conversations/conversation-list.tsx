"use client";

import type { ConversationListItem, ConversationListParams } from "@/lib/sdk-types";
import { MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/conversations/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListConversations } from "@/lib/api";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ConversationFilters = {
  status?: "OPEN" | "CLOSED" | "ARCHIVED";
  assigned?: boolean;
};

export function useConversations(filters: ConversationFilters, refreshKey: number) {
  const [items, setItems] = useState<ConversationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const params: ConversationListParams = { page: 1, limit: 50 };
      if (filters.status) {
        params.status = filters.status;
      }
      if (filters.assigned === true) {
        params.assigned = "true";
      }
      try {
        const data = await apiListConversations(params);
        if (!cancelled) {
          setItems(data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setItems([]);
        setError("No se pudieron cargar las conversaciones.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [filters.status, filters.assigned, refreshKey]);

  return { items, error };
}

type ConversationListProps = {
  items: ConversationListItem[] | null;
  error: string | null;
  selectedUuid?: string;
  compact?: boolean;
  onSelect?: (uuid: string) => void;
};

export function ConversationList({
  items,
  error,
  selectedUuid,
  compact,
  onSelect,
}: ConversationListProps) {
  if (items === null) {
    return (
      <div className="space-y-2" aria-label="Cargando conversaciones">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex gap-3 p-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Error al cargar"
        description={error}
        className="py-8"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Sin conversaciones"
        description="Cuando haya conversaciones con tus clientes, las vas a ver acá."
        className="py-8"
      />
    );
  }

  const row = (item: ConversationListItem) => {
    const selected = item.uuid === selectedUuid;
    const content = (
      <div className={cn("flex min-w-0 gap-3 p-3", !compact && "px-4")}>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {item.customerId ? item.customerId.slice(0, 2).toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">
              {item.customerId ? `Cliente #${item.customerId.slice(0, 8)}` : "Cliente sin vincular"}
            </p>
            {item.lastMessageAt && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatRelative(item.lastMessageAt)}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {formatNumber(item.messageCount)} mensajes
            </span>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag.uuid}
                className="inline-flex max-w-28 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                title={tag.name}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#a1a1aa" }}
                  aria-hidden="true"
                />
                <span className="truncate">{tag.name}</span>
              </span>
            ))}
            {item.advisor && (
              <span className="text-[11px] text-muted-foreground">
                Asesor: {item.advisor.firstName}
              </span>
            )}
          </div>
        </div>
      </div>
    );

    if (compact) {
      return (
        <button
          key={item.uuid}
          type="button"
          onClick={() => onSelect?.(item.uuid)}
          className={cn(
            "block w-full cursor-pointer rounded-md text-left transition-colors duration-150 motion-reduce:transition-none",
            selected ? "bg-sidebar-accent" : "hover:bg-muted/60",
          )}
          aria-current={selected ? "true" : undefined}
        >
          {content}
        </button>
      );
    }

    return (
      <a
        key={item.uuid}
        href={`/conversations/${item.uuid}`}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "block rounded-md transition-colors duration-150 motion-reduce:transition-none",
          selected ? "bg-sidebar-accent" : "hover:bg-muted/60",
        )}
      >
        {content}
      </a>
    );
  };

  return (
    <div className={cn("space-y-1", compact ? "px-2" : "px-3")}>
      {items.map(row)}
    </div>
  );
}