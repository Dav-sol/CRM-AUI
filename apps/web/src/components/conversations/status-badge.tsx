"use client";

import type { ConversationListItem } from "@/lib/sdk-types";

import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Abierta", className: "bg-primary/10 text-primary" },
  CLOSED: { label: "Cerrada", className: "bg-muted text-muted-foreground" },
  ARCHIVED: { label: "Archivada", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ConversationListItem["status"];
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}