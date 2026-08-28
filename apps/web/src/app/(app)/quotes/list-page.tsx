"use client";

import { FileText, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { QuoteSheet, QUOTE_STATUS_LABELS } from "@/components/quotes/quote-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiListQuotes } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type QuoteItem = NonNullable<Awaited<ReturnType<typeof apiListQuotes>>>[number];

const STATUS_TABS: { label: string; value: QuoteItem["status"] | undefined }[] = [
  { label: "Todas", value: undefined },
  { label: "Borradores", value: "DRAFT" },
  { label: "Enviadas", value: "ENVIADA" },
  { label: "Aceptadas", value: "ACEPTADA" },
  { label: "Rechazadas", value: "RECHAZADA" },
  { label: "Vencidas", value: "VENCIDA" },
];

export function QuotesIndexPage() {
  const [status, setStatus] = useState<QuoteItem["status"] | undefined>(undefined);
  const [quotes, setQuotes] = useState<QuoteItem[] | null>(null);
  const [selected, setSelected] = useState<QuoteItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiListQuotes({ status, limit: 100 });
        if (!cancelled) setQuotes(data);
      } catch (error) {
        if (cancelled) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setQuotes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function reload() {
    try {
      setQuotes(await apiListQuotes({ status, limit: 100 }));
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setQuotes([]);
      }
    }
  }

  const openQuotes = (quotes ?? []).filter(
    (quote) => quote.status === "ENVIADA" || quote.status === "DRAFT",
  );

  return (
    <div className="w-full space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            {openQuotes.length > 0
              ? `${openQuotes.length} cotizaciones abiertas esperando seguimiento.`
              : "Cotizaciones enviadas y su resultado comercial."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void reload()}>
            <RefreshCcw /> Actualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              status === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {quotes === null ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : quotes.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="Sin cotizaciones"
              description="Crea una cotización desde una conversación o desde el cliente 360."
              className="py-10"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <Card key={quote.uuid}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(quote);
                    setSheetOpen(true);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {quote.customerName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {quote.productName ?? "Sin producto específico"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${formatCurrency(quote.value)} · Creada{" "}
                    {formatDateTime(quote.createdAt)}
                    {quote.sentAt && ` · Enviada ${formatDateTime(quote.sentAt)}`}
                    {quote.campaignName && ` · ${quote.campaignName}`}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {quote.purchaseId && (
                    <Badge variant="outline" className="text-emerald-600">
                      Vendida
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <QuoteSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        quote={selected ?? undefined}
        customerId={selected?.customerId ?? undefined}
        customerName={selected?.customerName ?? undefined}
        conversationId={selected?.conversationId ?? undefined}
        campaignId={selected?.campaignId ?? undefined}
        onChanged={() => void reload()}
      />
    </div>
  );
}