"use client";

import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MessagesSquare,
  RotateCcw,
  ShoppingCart,
  Workflow,
  XCircle,
} from "lucide-react";

import type { CustomerTimeline as TimelineData } from "@/lib/api";
import { formatCivilDate, formatCurrency, formatDate } from "@/lib/format";

const STATUS_META: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "Completada", color: "text-green-600" },
  CANCELLED: { label: "Cancelada", color: "text-red-600" },
  REFUNDED: { label: "Reembolsada", color: "text-amber-600" },
  PENDING: { label: "Pendiente", color: "text-blue-600" },
  SCHEDULED: { label: "Programada", color: "text-blue-600" },
  EXECUTING: { label: "Ejecutando", color: "text-blue-600" },
  EXECUTED: { label: "Ejecutada", color: "text-green-600" },
  ERROR: { label: "Error", color: "text-red-600" },
  PAUSED: { label: "Pausada", color: "text-amber-600" },
  DRAFT: { label: "Borrador", color: "text-muted-foreground" },
  ENVIADA: { label: "Enviada", color: "text-blue-600" },
  ACEPTADA: { label: "Aceptada", color: "text-green-600" },
  RECHAZADA: { label: "Rechazada", color: "text-red-600" },
  VENCIDA: { label: "Vencida", color: "text-amber-600" },
  OPEN: { label: "Abierta", color: "text-green-600" },
  CLOSED: { label: "Cerrada", color: "text-muted-foreground" },
  ARCHIVED: { label: "Archivada", color: "text-muted-foreground" },
};

function getWarrantyStatus(
  warrantyExpiresAt: string | null,
): { label: string; color: string } | null {
  if (!warrantyExpiresAt) return null;
  const expiry = new Date(warrantyExpiresAt);
  const now = new Date();
  if (expiry < now) return { label: "Expirada", color: "text-red-600" };
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 30)
    return { label: `Vence en ${daysLeft}d`, color: "text-amber-600" };
  return { label: "Activa", color: "text-green-600" };
}

type CustomerTimelineProps = {
  timeline: TimelineData;
};

export function CustomerTimeline({ timeline }: CustomerTimelineProps) {
  const { purchases, quotes, conversations } = timeline;

  if (purchases.length === 0 && quotes.length === 0 && conversations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Este cliente no tiene actividad registrada en el timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Timeline del cliente
        </h2>
        <p className="text-xs text-muted-foreground">
          Historial cronológico de compras, automatizaciones, cotizaciones y
          conversaciones.
        </p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border/60" />

        <div className="space-y-1">
          {/* Purchases as main nodes */}
          {purchases.map((purchase) => {
            const warranty = getWarrantyStatus(purchase.warrantyExpiresAt);
            return (
              <div key={purchase.uuid} className="relative flex items-start gap-4 pl-2">
                {/* Purchase node */}
                <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950">
                  <ShoppingCart className="size-4 text-green-600 dark:text-green-400" />
                </div>

                {/* Purchase card */}
                <div className="flex-1 rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">
                        Compra: {purchase.product.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {purchase.product.code} · Factura #{purchase.invoiceNumber} ·{" "}
                        {formatCivilDate(purchase.purchaseDate)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium">
                          ${formatCurrency(purchase.value)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          · {purchase.quantity} unidad(es)
                        </span>
                        {warranty && (
                          <span className={`text-[11px] font-medium ${warranty.color}`}>
                            · Garantía {warranty.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Automations under this purchase */}
                  {purchase.automations.length > 0 && (
                    <div className="mt-3 border-t border-border/40 pt-2 space-y-1.5">
                      {purchase.automations.map((auto) => {
                        const autoMeta = STATUS_META[auto.status] ?? { label: auto.status, color: "" };
                        return (
                          <div
                            key={auto.uuid}
                            className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 p-2"
                          >
                            <Workflow className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium">
                                {auto.stageName ?? "Automatización"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(auto.scheduledDate).toLocaleDateString("es-EC")}
                                {auto.executedDate &&
                                  ` → ejecutada ${new Date(auto.executedDate).toLocaleDateString("es-EC")}`}
                              </p>
                              {auto.messagePreview && (
                                <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground italic">
                                  &ldquo;{auto.messagePreview}&rdquo;
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 text-[10px] font-medium ${autoMeta.color}`}>
                              {autoMeta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quotes linked to this purchase */}
                  {quotes
                    .filter((q) => q.createdAt >= purchase.purchaseDate)
                    .slice(0, 2)
                    .map((quote) => {
                      const qMeta = STATUS_META[quote.status] ?? { label: quote.status, color: "" };
                      return (
                        <div
                          key={quote.uuid}
                          className="mt-2 flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 p-2"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium">
                              Cotización · ${formatCurrency(quote.value)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDate(quote.createdAt)}
                            </p>
                          </div>
                          <span className={`text-[10px] font-medium ${qMeta.color}`}>
                            {qMeta.label}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}

          {/* Standalone quotes (not linked to any purchase in timeline) */}
          {quotes
            .filter(
              (q) =>
                !purchases.some(
                  (p) =>
                    q.createdAt >= p.purchaseDate &&
                    q.createdAt <=
                      new Date(
                        new Date(p.purchaseDate).getTime() + 86_400_000,
                      ).toISOString(),
                ),
            )
            .slice(0, 5)
            .map((quote) => {
              const qMeta = STATUS_META[quote.status] ?? { label: quote.status, color: "" };
              return (
                <div key={quote.uuid} className="relative flex items-start gap-4 pl-2">
                  <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                    <FileText className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 rounded-lg border border-border/60 bg-card p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">
                        Cotización · ${formatCurrency(quote.value)}
                      </p>
                      <span className={`text-[10px] font-medium ${qMeta.color}`}>
                        {qMeta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDate(quote.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}

          {/* Conversations */}
          {conversations.slice(0, 5).map((conv) => {
            const cMeta = STATUS_META[conv.status] ?? { label: conv.status, color: "" };
            return (
              <div key={conv.uuid} className="relative flex items-start gap-4 pl-2">
                <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                  <MessagesSquare className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">Conversación WhatsApp</p>
                    <span className={`text-[10px] font-medium ${cMeta.color}`}>
                      {cMeta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {conv.messageCount} mensaje{conv.messageCount !== 1 ? "s" : ""} ·{" "}
                    {formatDate(conv.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
