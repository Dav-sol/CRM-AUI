"use client";

import {
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingCart,
  Target,
  User,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AutomationDetailSheet } from "@/components/automations/automation-detail";
import { CreatePurchaseSheet } from "@/components/purchases/create-purchase-sheet";
import { CustomerStatusBadge } from "@/components/customers/customer-list";
import { CustomerTimeline } from "@/components/customers/customer-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiCustomerAllowContact,
  apiCustomerNoContact,
  apiGetCustomer,
  apiGetCustomerTimeline,
  apiListAutomations,
  apiListConversations,
  apiListPurchases,
  type CustomerTimeline as CustomerTimelineData,
} from "@/lib/api";
import { formatCivilDate, formatCurrency, formatDate, formatDateTime, formatNumber, formatPhone, formatRelative } from "@/lib/format";
import { AUTOMATION_STATUS_LABELS } from "@/lib/validators";

type Customer = Awaited<ReturnType<typeof apiGetCustomer>>;
type Purchase = Awaited<ReturnType<typeof apiListPurchases>>["data"][number];
type Automation = Awaited<
  ReturnType<typeof apiListAutomations>
>["data"][number];
type Conversation = Awaited<ReturnType<typeof apiListConversations>>[number];

function WarrantyBadge({
  months,
  expiresAt,
}: {
  months: number | null | undefined;
  expiresAt: string | null | undefined;
}) {
  const [now] = useState(() => Date.now());
  if (!months || !expiresAt) {
    return <Badge variant="outline">Sin garantía</Badge>;
  }
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (days < 0) {
    return (
      <Badge variant="destructive">Vencida · {formatDate(expiresAt)}</Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="secondary">Vence pronto · {formatDate(expiresAt)}</Badge>
    );
  }
  return (
    <Badge variant="default">
      {months} meses · vence {formatDate(expiresAt)}
    </Badge>
  );
}

function AutomationStatusBadge({ status }: { status: Automation["status"] }) {
  const variant =
    status === "EXECUTED"
      ? "default"
      : status === "CANCELLED" || status === "ERROR"
        ? "destructive"
        : status === "PAUSED"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{AUTOMATION_STATUS_LABELS[status]}</Badge>;
}

export function CustomerDetailView({ uuid }: { uuid: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [noContactBusy, setNoContactBusy] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(
    null,
  );
  const [timeline, setTimeline] = useState<CustomerTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const customerData = await apiGetCustomer(uuid);
        if (cancelled) return;
        setCustomer(customerData);
        const [purchasesResult, automationsResult, conversationsResult, timelineResult] =
          await Promise.allSettled([
            apiListPurchases({ customerId: customerData.id, limit: 100 }),
            apiListAutomations({ customerId: customerData.uuid, limit: 50 }),
            apiListConversations({ customerId: customerData.uuid, limit: 50 }),
            apiGetCustomerTimeline(customerData.uuid),
          ]);
        if (cancelled) return;
        setPurchases(purchasesResult.status === "fulfilled" ? purchasesResult.value.data : []);
        setAutomations(automationsResult.status === "fulfilled" ? automationsResult.value.data : []);
        setConversations(conversationsResult.status === "fulfilled" ? conversationsResult.value : []);
        setTimeline(timelineResult.status === "fulfilled" ? timelineResult.value : null);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return;
        if (error instanceof ApiError && error.status === 404) {
          setCustomer(null);
          setLoading(false);
          return;
        }
        setError("No se pudieron cargar los datos del cliente.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uuid]);

  if (loading && customer === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6 lg:p-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {error ?? "El cliente no existe o fue eliminado."}
        </p>
      </div>
    );
  }

  const totalPurchases = purchases?.length ?? 0;
  const totalSpent =
    purchases?.reduce((acc, p) => acc + Number(p.value), 0) ?? 0;

  const orderedAutomations = automations
    ? [...automations].sort((a, b) => {
        const aUpcoming =
          a.status === "SCHEDULED" &&
          new Date(a.scheduledDate).getTime() >= now;
        const bUpcoming =
          b.status === "SCHEDULED" &&
          new Date(b.scheduledDate).getTime() >= now;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime();
      })
    : null;

  const nextAutomation =
    automations
      ?.filter(
        (automation) =>
          automation.status === "SCHEDULED" &&
          new Date(automation.scheduledDate).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() -
          new Date(b.scheduledDate).getTime(),
      )[0] ?? null;

  const activeWarranty =
    purchases
      ?.filter(
        (purchase) =>
          purchase.warrantyExpiresAt &&
          new Date(purchase.warrantyExpiresAt).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.warrantyExpiresAt!).getTime() -
          new Date(b.warrantyExpiresAt!).getTime(),
      )[0] ?? null;

  const hasExpiredWarranty =
    purchases?.some(
      (purchase) =>
        purchase.warrantyExpiresAt &&
        new Date(purchase.warrantyExpiresAt).getTime() < now,
    ) ?? false;

  const actionable = [
    ...(nextAutomation
      ? [
          {
            key: "automation",
            label: nextAutomation.campaign?.name
              ? `Mensaje de ${nextAutomation.campaign.name} ${formatRelative(nextAutomation.scheduledDate)}`
              : `Mensaje programado ${formatRelative(nextAutomation.scheduledDate)}`,
          },
        ]
      : []),
    ...(activeWarranty
      ? [
          {
            key: "warranty",
            label: `Garantía de ${activeWarranty.product.name} vence ${formatRelative(activeWarranty.warrantyExpiresAt!)}`,
          },
        ]
      : []),
    ...(hasExpiredWarranty
      ? [
          {
            key: "repurchase",
            label: "Garantía vencida — evaluar recompra",
          },
        ]
      : []),
  ];

  async function toggleNoContact() {
    if (!customer) return;
    setNoContactBusy(true);
    try {
      const updated = customer.noContactAt
        ? await apiCustomerAllowContact(customer.id)
        : await apiCustomerNoContact(customer.id);
      setCustomer(updated);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      toast.error("No se pudo actualizar la preferencia de contacto.");
    } finally {
      setNoContactBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6 lg:p-8">
      {/* Hero Card — Resumen de relación */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  {customer.name}
                </h1>
                <CustomerStatusBadge status={customer.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Código: {customer.codcli}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {customer.email && (
                  <span className="flex items-center gap-2">
                    <Mail className="size-4" /> {customer.email}
                  </span>
                )}
                {customer.city && (
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4" /> {customer.city}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {customer.phone && conversations && conversations.length > 0 && (
                  <Link
                    href={`/conversations/${conversations[0].uuid}`}
                    className="inline-flex items-center gap-2 rounded-md border border-green-500/30 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
                  >
                    <MessageCircle className="size-4" />
                    Conversación
                  </Link>
                )}
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Phone className="size-4" />
                    {formatPhone(customer.phone)}
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Qué hacer ahora */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-primary" /> Qué hacer ahora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customer.noContactAt && (
            <p className="text-xs font-medium text-destructive">
              Cliente pidió no ser contactado
              {customer.noContactReason ? ` · ${customer.noContactReason}` : ""}
              . No recibirá envíos comerciales ni automatizaciones.
            </p>
          )}
          {actionable.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actionable.map((item) => (
                <Badge
                  key={item.key}
                  variant="outline"
                  className="bg-card text-foreground"
                >
                  {item.label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sin acciones pendientes para este cliente.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <CreatePurchaseSheet
              initialCustomerId={customer.id}
              triggerLabel="Registrar venta"
              onCreated={() => {
                void (async () => {
                  const data = await apiListPurchases({
                    customerId: customer.id,
                    limit: 100,
                  });
                  setPurchases(data.data);
                })();
              }}
            />
            <Button
              variant={customer.noContactAt ? "outline" : "destructive"}
              size="sm"
              disabled={noContactBusy}
              onClick={() => void toggleNoContact()}
            >
              {customer.noContactAt ? "Permitir contacto" : "No contactar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingCart className="size-4" /> Compras
            </div>
            <p className="mt-1 text-2xl font-semibold">
              {formatNumber(totalPurchases)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="size-4" /> Total invertido
            </div>
            <p className="mt-1 text-2xl font-semibold">
              ${formatCurrency(totalSpent)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {timeline && <CustomerTimeline timeline={timeline} />}

      {/* Purchases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4 text-primary" /> Compras e historial
            de garantía
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases === null ? (
            <Skeleton className="h-32 w-full" />
          ) : purchases.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Sin compras"
              description="Este cliente no tiene compras registradas."
              className="py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 pr-4 font-medium">Producto</th>
                    <th className="py-2 pr-4 font-medium">Factura</th>
                    <th className="py-2 pr-4 font-medium">Cant.</th>
                    <th className="py-2 pr-4 font-medium">Valor</th>
                    <th className="py-2 font-medium">Garantía</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map((purchase) => (
                    <tr key={purchase.uuid}>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatCivilDate(purchase.purchaseDate)}
                      </td>
                      <td className="max-w-[180px] truncate py-2 pr-4">
                        {purchase.product.name}
                      </td>
                      <td className="py-2 pr-4">{purchase.invoiceNumber}</td>
                      <td className="py-2 pr-4">{purchase.quantity}</td>
                      <td className="py-2 pr-4">${purchase.value}</td>
                      <td className="py-2">
                        <WarrantyBadge
                          months={purchase.warrantyMonths}
                          expiresAt={purchase.warrantyExpiresAt}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automations */}
      {orderedAutomations && orderedAutomations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="size-4 text-primary" /> Automatizaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {orderedAutomations.slice(0, 8).map((automation) => (
                <li key={automation.uuid}>
                  <button
                    type="button"
                    onClick={() => setSelectedAutomation(automation.uuid)}
                    className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {automation.stageName ??
                          automation.campaign?.name ??
                          "Seguimiento"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Programada {formatDateTime(automation.scheduledDate)}
                      </p>
                    </div>
                    <AutomationStatusBadge status={automation.status} />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AutomationDetailSheet
        uuid={selectedAutomation}
        onClose={() => setSelectedAutomation(null)}
      />
    </div>
  );
}
