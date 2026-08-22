"use client";

import {
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShoppingCart,
  User,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CustomerStatusBadge } from "@/components/customers/customer-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiGetCustomer,
  apiListAutomations,
  apiListConversations,
  apiListPurchases,
} from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatPhone } from "@/lib/format";
import { AUTOMATION_STATUS_LABELS } from "@/lib/validators";

type Customer = Awaited<ReturnType<typeof apiGetCustomer>>;
type Purchase = Awaited<ReturnType<typeof apiListPurchases>>["data"][number];
type Automation = Awaited<ReturnType<typeof apiListAutomations>>["data"][number];
type Conversation = Awaited<ReturnType<typeof apiListConversations>>[number];

function WarrantyBadge({ months, expiresAt }: { months: number | null | undefined; expiresAt: string | null | undefined }) {
  const [now] = useState(() => Date.now());
  if (!months || !expiresAt) {
    return <Badge variant="outline">Sin garantía</Badge>;
  }
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (days < 0) {
    return <Badge variant="destructive">Vencida · {formatDate(expiresAt)}</Badge>;
  }
  if (days <= 30) {
    return <Badge variant="secondary">Vence pronto · {formatDate(expiresAt)}</Badge>;
  }
  return <Badge variant="default">{months} meses · vence {formatDate(expiresAt)}</Badge>;
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
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const customerData = await apiGetCustomer(uuid);
        if (cancelled) return;
        setCustomer(customerData);
        const [purchasesData, automationsData, conversationsData] = await Promise.all([
          apiListPurchases({ customerId: customerData.id, limit: 100 }),
          apiListAutomations({ customerId: customerData.uuid, limit: 50 }),
          apiListConversations({ customerId: customerData.uuid, limit: 50 }),
        ]);
        if (cancelled) return;
        setPurchases(purchasesData.data);
        setAutomations(automationsData.data);
        setConversations(conversationsData);
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
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  if (loading && customer === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6 lg:p-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
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
  const totalSpent = purchases?.reduce((acc, p) => acc + Number(p.value), 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6 lg:p-8">
      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{customer.name}</h1>
                <CustomerStatusBadge status={customer.status} />
              </div>
              <p className="text-sm text-muted-foreground">Código: {customer.codcli}</p>
            </div>
            <div className="grid shrink-0 gap-1 text-sm">
              {customer.phone && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-4" /> {formatPhone(customer.phone)}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-4" /> {customer.email}
                </span>
              )}
              {customer.city && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-4" /> {customer.city}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingCart className="size-4" /> Compras
            </div>
            <p className="mt-1 text-2xl font-semibold">{formatNumber(totalPurchases)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="size-4" /> Total invertido
            </div>
            <p className="mt-1 text-2xl font-semibold">${formatNumber(totalSpent)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Purchases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4 text-primary" /> Compras e historial de garantía
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases === null ? (
            <Skeleton className="h-32 w-full" />
          ) : purchases.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Sin compras" description="Este cliente no tiene compras registradas." className="py-6" />
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
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(purchase.purchaseDate)}</td>
                      <td className="max-w-[180px] truncate py-2 pr-4">{purchase.product.name}</td>
                      <td className="py-2 pr-4">{purchase.invoiceNumber}</td>
                      <td className="py-2 pr-4">{purchase.quantity}</td>
                      <td className="py-2 pr-4">${purchase.value}</td>
                      <td className="py-2">
                        <WarrantyBadge months={purchase.warrantyMonths} expiresAt={purchase.warrantyExpiresAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Automations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="size-4 text-primary" /> Automatizaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {automations === null ? (
              <Skeleton className="h-32 w-full" />
            ) : automations.length === 0 ? (
              <EmptyState icon={Workflow} title="Sin automatizaciones" description="Este cliente no tiene seguimiento programado." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {automations.slice(0, 8).map((automation) => (
                  <li key={automation.uuid} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatDateTime(automation.scheduledDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {automation.executedDate ? `Ejecutada ${formatDateTime(automation.executedDate)}` : "Programada"}
                      </p>
                    </div>
                    <AutomationStatusBadge status={automation.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="size-4 text-primary" /> Conversaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversations === null ? (
              <Skeleton className="h-32 w-full" />
            ) : conversations.length === 0 ? (
              <EmptyState icon={MessageSquareText} title="Sin conversaciones" description="Este cliente no tiene conversaciones." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {conversations.slice(0, 8).map((conversation) => (
                  <li key={conversation.uuid}>
                    <Link
                      href={`/conversations/${conversation.uuid}`}
                      className="flex items-center justify-between gap-3 rounded-md p-2 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{formatDateTime(conversation.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.messageCount} mensajes
                        </p>
                      </div>
                      <Badge variant="outline">{conversation.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}