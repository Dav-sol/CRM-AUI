"use client";

import type { DashboardActivityItem } from "@/lib/sdk-types";
import { History } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";

type ActivityFeedProps = {
  items: DashboardActivityItem[] | null;
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items === null) {
    return (
      <div className="space-y-3" aria-label="Cargando actividad">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Sin actividad todavía"
        description="Cuando el sistema registre eventos, los vas a ver acá."
      />
    );
  }

  return (
    <ol className="relative space-y-4" aria-label="Actividad reciente">
      {items.map((item) => (
        <li key={item.uuid} className="flex gap-3">
          <div
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {item.description ?? item.action}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.userName ?? "Sistema"} · {formatRelative(item.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}