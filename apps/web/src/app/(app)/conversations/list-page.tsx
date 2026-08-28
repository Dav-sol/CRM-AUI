"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";

import {
  ConversationList,
  useConversations,
  type ConversationFilters,
} from "@/components/conversations/conversation-list";
import { ReplyBox } from "@/components/conversations/reply-box";
import { Thread } from "@/components/conversations/thread";
import { QuoteSheet } from "@/components/quotes/quote-sheet";
import { CreatePurchaseSheet } from "@/components/purchases/create-purchase-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGetConversation, apiReplyConversation } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: ConversationFilters["status"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Abiertas", value: "OPEN" },
  { label: "Cerradas", value: "CLOSED" },
  { label: "Archivadas", value: "ARCHIVED" },
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  ARCHIVED: "Archivada",
};

export function ConversationsIndexPage() {
  const [status, setStatus] =
    useState<ConversationFilters["status"]>(undefined);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState("");
  const [sort, setSort] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, error } = useConversations(
    { status, assigned: assignedOnly, name, sort },
    refreshKey,
  );

  // Inbox master-detail (Fase 6): lista a la izquierda, chat a la derecha sin
  // navegar a otra pantalla.
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [selected, setSelected] = useState<Awaited<
    ReturnType<typeof apiGetConversation>
  > | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  // Tiempo real ligero (Fase 5): refresca la bandeja cada 30s mientras esté
  // visible. (SSE/WebSocket queda documentado como siguiente paso.)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshKey((key) => key + 1);
        if (selectedUuid) {
          void selectConversation(selectedUuid, false);
        }
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [selectedUuid]);

  async function selectConversation(uuid: string, loading = true) {
    if (loading) {
      setSelectedLoading(true);
    }
    try {
      const data = await apiGetConversation(uuid);
      setSelected(data);
      setSelectedUuid(uuid);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
    } finally {
      if (loading) {
        setSelectedLoading(false);
      }
    }
  }

  async function handleReply(content: string) {
    if (!selectedUuid) {
      return;
    }
    try {
      await apiReplyConversation(selectedUuid, { content });
      await selectConversation(selectedUuid, false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
    }
  }

  const selectClass =
    "h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50";

  return (
    <div className="flex h-full w-full flex-col p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Conversaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Bandeja de mensajes de tus clientes.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setName(nameInput.trim());
          }}
          className="relative w-full max-w-xs"
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Buscar por cliente…"
            className="pl-9"
            aria-label="Buscar conversación"
            maxLength={100}
          />
        </form>
        <div
          className="flex items-center gap-1 rounded-lg bg-muted p-1"
          role="tablist"
        >
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
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className={cn(selectClass, "appearance-none")}
          aria-label="Ordenar conversaciones"
        >
          <option value="">Orden</option>
          <option value="-updatedAt">Última actividad (nueva → vieja)</option>
          <option value="updatedAt">Última actividad (vieja → nueva)</option>
          <option value="-createdAt">Creada (nueva → vieja)</option>
          <option value="createdAt">Creada (vieja → nueva)</option>
          <option value="status">Estado</option>
        </select>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        {/* Lista (se oculta en móvil cuando hay una conversación abierta) */}
        <div
          className={cn(
            "flex w-full shrink-0 flex-col min-h-0 lg:w-96",
            selectedUuid && "hidden lg:flex",
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
            <ConversationList
              items={items}
              error={error}
              selectedUuid={selectedUuid ?? undefined}
              compact
              onSelect={(nextUuid) => void selectConversation(nextUuid)}
            />
          </div>
        </div>

        {/* Chat seleccionado */}
        <div
          className={cn(
            "min-h-0 flex-1 flex-col rounded-lg border border-border/60",
            selectedUuid
              ? "flex"
              : "hidden lg:flex lg:items-center lg:justify-center",
          )}
        >
          {!selectedUuid ? (
            <p className="px-6 text-sm text-muted-foreground">
              Selecciona una conversación para ver el chat.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 lg:hidden"
                    onClick={() => {
                      setSelectedUuid(null);
                      setSelected(null);
                    }}
                    aria-label="Volver a la lista"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">
                      {selected?.customer?.name ?? "Cliente sin vincular"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selected?.customer?.status === "PENDING"
                        ? "Pendiente de vinculación"
                        : STATUS_LABELS[selected?.status ?? "OPEN"]}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuoteOpen(true)}
                  >
                    Cotizar
                  </Button>
                  <CreatePurchaseSheet
                    initialCustomerId={selected?.customerId ?? undefined}
                    sourceConversationId={selectedUuid}
                    triggerLabel="Registrar venta"
                    onCreated={() =>
                      void selectConversation(selectedUuid, false)
                    }
                  />
                  <Badge variant="outline">
                    {selected?.messageCount ?? 0} mensajes
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {selectedLoading ? (
                  <div className="space-y-3 p-6">
                    <Skeleton className="h-16 w-2/3" />
                    <Skeleton className="h-16 w-3/4" />
                    <Skeleton className="h-16 w-1/2" />
                  </div>
                ) : (
                  <Thread messages={selected?.messages ?? []} loading={false} />
                )}
              </div>
              <ReplyBox onSend={(content) => handleReply(content)} />
            </>
          )}
        </div>
      </div>

      <QuoteSheet
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        customerId={selected?.customerId ?? undefined}
        customerName={selected?.customer?.name ?? undefined}
        conversationId={selectedUuid ?? undefined}
        campaignId={
          (selected?.messages.find((message) => message.inReplyToCampaignId)
            ?.inReplyToCampaignId ?? undefined) as string | undefined
        }
        onChanged={() => {
          if (selectedUuid) {
            void selectConversation(selectedUuid, false);
          }
        }}
      />
    </div>
  );
}
