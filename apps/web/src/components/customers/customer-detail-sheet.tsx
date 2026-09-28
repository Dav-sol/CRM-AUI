"use client";

import {
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingCart,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CustomerStatusBadge } from "@/components/customers/customer-list";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ApiError,
  apiGetCustomer,
  apiListConversations,
  apiListPurchases,
} from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPhone,
} from "@/lib/format";

type CustomerDetailSheetProps = {
  customerUuid: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Sheet with the customer quick view, opened from the conversation inbox.
 *
 * The sheet itself only owns the open state; the data lives in a body keyed by
 * `customerUuid`, so opening for another customer (or reopening after a close)
 * mounts a fresh body instead of resetting state from an effect.
 */
export function CustomerDetailSheet({
  customerUuid,
  open,
  onOpenChange,
}: CustomerDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Detalle del cliente</SheetTitle>
          <SheetDescription>
            Contacto, resumen de compras y acceso directo a la conversación.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {open && customerUuid ? (
            <CustomerSheetBody key={customerUuid} customerUuid={customerUuid} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Customer = Awaited<ReturnType<typeof apiGetCustomer>>;
type Purchase = Awaited<ReturnType<typeof apiListPurchases>>["data"][number];

const PURCHASES_LIMIT = 100;

function CustomerSheetBody({ customerUuid }: { customerUuid: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [conversationUuid, setConversationUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const customerData = await apiGetCustomer(customerUuid);
        if (cancelled) return;
        setCustomer(customerData);

        const [purchasesResult, conversationsResult] = await Promise.allSettled(
          [
            // customerId filters purchases by the internal id, conversations by uuid.
            apiListPurchases({
              customerId: customerData.id,
              limit: PURCHASES_LIMIT,
            }),
            apiListConversations({ customerId: customerData.uuid, limit: 1 }),
          ],
        );
        if (cancelled) return;
        setPurchases(
          purchasesResult.status === "fulfilled"
            ? purchasesResult.value.data
            : [],
        );
        // The count comes from the server so it is not capped by the page size.
        setPurchasesTotal(
          purchasesResult.status === "fulfilled"
            ? purchasesResult.value.meta.total
            : 0,
        );
        setConversationUuid(
          conversationsResult.status === "fulfilled" &&
            conversationsResult.value.length > 0
            ? conversationsResult.value[0].uuid
            : null,
        );
      } catch (error) {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 404)
        )
          return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerUuid]);

  const shownPurchases = purchases?.length ?? 0;
  const totalSpent =
    purchases?.reduce((acc, purchase) => acc + Number(purchase.value), 0) ?? 0;
  const truncated = purchasesTotal > shownPurchases;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo cargar la información del cliente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{customer.name}</h3>
            <CustomerStatusBadge status={customer.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Código: {customer.codcli}
          </p>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-2 rounded-lg border border-border/60 p-3">
        {customer.phone && conversationUuid && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" />
            <a
              href={`tel:${customer.phone}`}
              className="text-foreground hover:underline"
            >
              {formatPhone(customer.phone)}
            </a>
            <Link
              href={`/conversations/${conversationUuid}`}
              className="ml-auto inline-flex items-center gap-1 text-xs text-green-600 hover:underline"
            >
              <MessageCircle className="size-3" />
              Conversación
            </Link>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-4 text-muted-foreground" />
            <span className="truncate">{customer.email}</span>
          </div>
        )}
        {customer.city && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            <span>{customer.city}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShoppingCart className="size-3.5" />
            Compras
          </div>
          <p className="mt-1 text-lg font-semibold">
            {formatNumber(purchasesTotal)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">
            Total invertido{truncated ? ` (últimas ${shownPurchases})` : ""}
          </p>
          <p className="mt-1 text-lg font-semibold">
            ${formatCurrency(totalSpent)}
          </p>
        </div>
      </div>

      {/* Recent purchases */}
      {shownPurchases > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground">
            Últimas compras
          </h4>
          <ul className="mt-2 space-y-2">
            {purchases?.slice(0, 5).map((purchase) => (
              <li
                key={purchase.uuid}
                className="rounded-md border border-border/60 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-medium">
                    {purchase.product.name}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDate(purchase.purchaseDate)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>${formatCurrency(Number(purchase.value))}</span>
                  {purchase.warrantyExpiresAt && (
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      Garantía {formatDate(purchase.warrantyExpiresAt)}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Link to full detail */}
      <Link
        href={`/customers/${customer.uuid}`}
        className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ExternalLink className="size-3.5" />
        Ver ficha completa
      </Link>
    </div>
  );
}
