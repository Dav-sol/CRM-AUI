"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CreatePurchaseSheet } from "@/components/purchases/create-purchase-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiAcceptQuote,
  apiCreateQuote,
  apiExpireQuote,
  apiListProducts,
  apiRejectQuote,
  apiSendQuote,
  apiUpdateQuote,
} from "@/lib/api";
import type { ProductItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";

type QuoteItem = Awaited<ReturnType<typeof apiCreateQuote>>;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ENVIADA: "Enviada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  VENCIDA: "Vencida",
};

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type QuoteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: string;
  customerName?: string;
  conversationId?: string;
  campaignId?: string;
  quote?: QuoteItem;
  onChanged?: () => void;
};

export function QuoteSheet({
  open,
  onOpenChange,
  customerId,
  customerName,
  conversationId,
  campaignId,
  quote,
  onChanged,
}: QuoteSheetProps) {
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let loadedProducts: ProductItem[] | null = null;
      try {
        const data = await apiListProducts({ page: 1, limit: 100 });
        if (!cancelled) {
          setProducts(data.data);
          loadedProducts = data.data;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          setProducts([]);
        }
      }
      if (!cancelled) {
        const pid = quote?.productId ?? "";
        const val = quote ? String(quote.value) : "";
        setProductId(pid);
        setQuantity(quote ? String(quote.quantity) : "1");
        setNote(quote?.note ?? "");
        // Auto-fill value from product price for new quotes when value is empty
        if (!val && pid && loadedProducts) {
          const product = loadedProducts.find((p) => p.id === pid);
          if (product?.price != null) {
            setValue(String(product.price));
            return;
          }
        }
        setValue(val);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, quote]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      toast.success("Cotización actualizada");
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo actualizar la cotización",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!value || Number.isNaN(Number(value))) {
      toast.error("Ingresa un valor válido");
      return;
    }
    setBusy(true);
    try {
      if (quote) {
        await apiUpdateQuote(quote.uuid, {
          productId: productId || undefined,
          quantity: Number(quantity) || 1,
          value: Number(value),
          note: note || undefined,
        });
      } else {
        await apiCreateQuote({
          customerId,
          conversationId,
          campaignId,
          productId: productId || undefined,
          quantity: Number(quantity) || 1,
          value: Number(value),
          note: note || undefined,
        });
      }
      toast.success(
        quote ? "Cotización actualizada" : "Cotización creada (borrador)",
      );
      onOpenChange(false);
      onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo guardar la cotización",
      );
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = quote ? (
    <Badge variant="outline">
      {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
    </Badge>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {quote ? "Cotización" : "Nueva cotización"}
          </SheetTitle>
          <SheetDescription>
            {customerName ?? "Cliente"} · {statusBadge}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="quote-product">Producto</Label>
            <select
              id="quote-product"
              className={cn(selectClass, "appearance-none")}
              value={productId}
              onChange={(event) => {
                const newId = event.target.value;
                setProductId(newId);
                if (!value && newId) {
                  const p = products?.find((item) => item.id === newId);
                  if (p?.price != null) {
                    setValue(String(p.price));
                  }
                }
              }}
            >
              <option value="">Sin producto específico</option>
              {products?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quote-qty">Cantidad</Label>
              <Input
                id="quote-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-value">Valor</Label>
              <Input
                id="quote-value"
                type="number"
                step="0.01"
                min={0}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-note">Nota</Label>
            <textarea
              id="quote-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Condiciones, vigencia, instalación…"
            />
          </div>

          {quote && (
            <div className="space-y-1 border-t border-border/40 pt-3 text-xs text-muted-foreground">
              <p>Creada: {quote.createdAt?.slice(0, 10)}</p>
              {quote.sentAt && <p>Enviada: {quote.sentAt.slice(0, 10)}</p>}
              {quote.acceptedAt && (
                <p>Aceptada: {quote.acceptedAt.slice(0, 10)}</p>
              )}
              {quote.purchaseId && <p>Venta vinculada: sí</p>}
            </div>
          )}

          {products === null && (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border/60">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {quote ? (
                <>
                  {(quote.status === "DRAFT" || quote.status === "ENVIADA") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => save())}
                      >
                        Guardar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => apiSendQuote(quote.uuid))}
                      >
                        Enviar
                      </Button>
                    </>
                  )}
                  {quote.status === "ENVIADA" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(() => apiAcceptQuote(quote.uuid))
                        }
                      >
                        Aceptar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(() => apiRejectQuote(quote.uuid))
                        }
                      >
                        Rechazar
                      </Button>
                    </>
                  )}
                  {quote.status !== "ACEPTADA" &&
                    quote.status !== "VENCIDA" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(() => apiExpireQuote(quote.uuid))
                        }
                      >
                        Vencer
                      </Button>
                    )}
                  {quote.status === "ACEPTADA" && (
                    <CreatePurchaseSheet
                      quoteId={quote.uuid}
                      initialCustomerId={customerId}
                      initialProductId={quote.productId ?? undefined}
                      initialValue={quote ? String(quote.value) : undefined}
                      triggerLabel="Registrar venta"
                      onCreated={() => {
                        onOpenChange(false);
                        onChanged?.();
                      }}
                    />
                  )}
                </>
              ) : (
                <Button disabled={busy} onClick={() => void save()}>
                  Crear cotización
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
