"use client";

import { GitBranch, LayoutList, Megaphone, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { MessageOverview } from "@/components/messages/message-overview";
import { MessagesTimeline } from "@/components/messages/messages-timeline";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiMessagesOverview,
  type AggregatedMessage,
} from "@/lib/api";

const SOURCE_OPTIONS = [
  { value: "all", label: "Todas las fuentes" },
  { value: "campaign_template", label: "Plantilla de campaña" },
  { value: "campaign_stage", label: "Etapa de campaña" },
  { value: "sequence_stage", label: "Etapa de secuencia" },
  { value: "quick_reply", label: "Respuesta rápida" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  campaign_template: "Campaña",
  campaign_stage: "Etapa campaña",
  sequence_stage: "Etapa secuencia",
  quick_reply: "Respuesta rápida",
};

export function MessagesIndexPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [messages, setMessages] = useState<AggregatedMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiMessagesOverview();
        if (!cancelled) setMessages(data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError
              ? e.message
              : "Error al cargar los mensajes",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = (messages ?? []).filter((m) => {
    if (source !== "all" && m.source !== source) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.sourceName.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: messages?.length ?? 0,
    campaign_template:
      messages?.filter((m) => m.source === "campaign_template").length ?? 0,
    campaign_stage:
      messages?.filter((m) => m.source === "campaign_stage").length ?? 0,
    sequence_stage:
      messages?.filter((m) => m.source === "sequence_stage").length ?? 0,
    quick_reply:
      messages?.filter((m) => m.source === "quick_reply").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mensajes</h1>
          <p className="text-sm text-muted-foreground">
            Todos los mensajes que envía tu organización, organizados por
            fuente.
          </p>
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex flex-wrap gap-2">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSource(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              source === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
            <span className="ml-1.5 text-[10px] opacity-70">
              {counts[opt.value as keyof typeof counts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search + View toggle */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar en mensajes..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearch(e.target.value)
            }
            className="pl-9"
          />
        </div>
        <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutList className="size-3.5" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "timeline"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitBranch className="size-3.5" />
            Timeline
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={Megaphone}
          title="Error al cargar"
          description={error}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Sin mensajes"
          description="No se encontraron mensajes con estos filtros."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtered.length} mensaje{filtered.length !== 1 ? "s" : ""}
          </p>
          {viewMode === "list" ? (
            <MessageOverview
              messages={filtered}
              onUpdated={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <MessagesTimeline messages={filtered} />
          )}
        </>
      )}
    </div>
  );
}
