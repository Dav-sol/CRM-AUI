"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import {
  ConversationList,
  useConversations,
  type ConversationFilters,
} from "@/components/conversations/conversation-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: ConversationFilters["status"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Abiertas", value: "OPEN" },
  { label: "Cerradas", value: "CLOSED" },
  { label: "Archivadas", value: "ARCHIVED" },
];

export function ConversationsIndexPage() {
  const [status, setStatus] = useState<ConversationFilters["status"]>(undefined);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, error } = useConversations({ status, assigned: assignedOnly }, refreshKey);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Conversaciones</h1>
          <p className="text-sm text-muted-foreground">
            Bandeja de mensajes de tus clientes.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Input
                  type="search"
                  placeholder="Buscar conversación…"
                  className="pl-9"
                  aria-label="Buscar conversación"
                  disabled
                />
              }
            />
            <TooltipContent>Próximamente</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                status === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAssignedOnly((v) => !v)}
          aria-pressed={assignedOnly}
          className={cn(assignedOnly && "bg-muted")}
        >
          Solo asignadas
        </Button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        <ConversationList items={items} error={error} />
      </div>
    </div>
  );
}