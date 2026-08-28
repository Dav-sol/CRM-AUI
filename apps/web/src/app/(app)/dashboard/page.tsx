"use client";

import {
  AlertTriangle,
  CalendarClock,
  FileText,
  MessageSquareText,
  RefreshCcw,
  ShoppingCart,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { CampaignsPanel } from "@/components/dashboard/campaigns-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiDashboardActionable,
  apiDashboardActivity,
  apiDashboardCampaigns,
  apiDashboardSummary,
} from "@/lib/api";
import {
  formatCurrency, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Actionable = Awaited<ReturnType<typeof apiDashboardActionable>>;
type DashboardRange = {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof apiDashboardSummary>
  > | null>(null);
  const [activity, setActivity] = useState<Awaited<
    ReturnType<typeof apiDashboardActivity>
  > | null>(null);
  const [campaigns, setCampaigns] = useState<Awaited<
    ReturnType<typeof apiDashboardCampaigns>
  > | null>(null);
  const [actionable, setActionable] = useState<Actionable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DashboardRange>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = {
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
          ...(range.compareFrom ? { compareFrom: range.compareFrom } : {}),
          ...(range.compareTo ? { compareTo: range.compareTo } : {}),
        };
        const [summaryData, activityData, campaignsData, actionableData] =
          await Promise.all([
            apiDashboardSummary(params),
            apiDashboardActivity(params),
            apiDashboardCampaigns(),
            apiDashboardActionable(),
          ]);
        if (cancelled) {
          return;
        }
        setSummary(summaryData);
        setActivity(activityData);
        setCampaigns(campaignsData);
        setActionable(actionableData);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setError("No se pudieron cargar los datos del dashboard.");
        toast.error("Error al cargar el dashboard");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, range.compareFrom, range.compareTo]);

  return (
    <div className="w-full space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Qué está pasando y qué requiere tu atención hoy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Link
            href="/conversations"
            className={buttonVariants({ variant: "outline" })}
          >
            <MessageSquareText />
            Ver conversaciones
          </Link>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div>
          {summary ? (
            <KpiCard
              icon={Users}
              label="Clientes nuevos"
              value={formatNumber(summary.customers.newInRange)}
              hint={`${formatNumber(summary.customers.total)} clientes en total`}
              delta={summary.customers.newDelta}
              href="/customers"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={ShoppingCart}
              label="Compras"
              value={formatNumber(summary.purchases.inRange)}
              hint={`${formatNumber(summary.purchases.thisMonth)} este mes`}
              delta={summary.purchases.countDelta}
              href="/purchases"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={ShoppingCart}
              label="Ingresos"
              value={`$${formatCurrency(summary.purchases.value)}`}
              hint="Suma de compras en el período"
              delta={summary.purchases.valueDelta}
              href="/purchases"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={MessageSquareText}
              label="Mensajes enviados"
              value={formatNumber(summary.messages.sentInRange)}
              hint={`${formatNumber(summary.messages.pending)} en cola`}
              delta={summary.messages.sentDelta}
              href="/conversations"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={Workflow}
              label="Automatizaciones ejecutadas"
              value={formatNumber(summary.automations.executedInRange)}
              hint={`${formatNumber(summary.automations.scheduled)} programadas`}
              delta={summary.automations.executedDelta}
              href="/automations"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {actionable ? (
            <KpiCard
              icon={FileText}
              label="Cotizaciones abiertas"
              value={formatNumber(actionable.openQuotes.length)}
              hint="Borradores y enviadas sin cerrar"
              href="/quotes"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
      </div>

      {/* Qué hacer hoy (datos reales, demo D3) */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-primary" />
            Qué hacer hoy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actionable === null ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <ActionableColumn
                icon={<CalendarClock className="size-4 text-primary" />}
                title="Próximas automatizaciones"
                empty="Sin mensajes programados."
                items={actionable.upcomingAutomations.map((item) => ({
                  key: item.uuid,
                  headline: item.customerName,
                  detail: [item.campaignName ?? "", item.productName]
                    .filter(Boolean)
                    .join(" · "),
                  when: formatRelative(item.scheduledDate),
                  href: "/automations",
                }))}
                href="/automations"
              />
              <ActionableColumn
                icon={<AlertTriangle className="size-4 text-amber-500" />}
                title="Garantías por vencer (30 días)"
                empty="Sin garantías próximas a vencer."
                items={actionable.expiringWarranties.map((item) => ({
                  key: `${item.purchaseId}-exp`,
                  headline: item.customerName,
                  detail: item.productName,
                  when: `Vence ${formatDateTime(item.warrantyExpiresAt)}`,
                  href: item.customerUuid
                    ? `/customers/${item.customerUuid}`
                    : "/customers?warrantyExpiringInDays=30",
                }))}
                href="/customers?warrantyExpiringInDays=30"
              />
              <ActionableColumn
                icon={<RefreshCcw className="size-4 text-emerald-500" />}
                title="Ventas potenciales"
                empty="Sin oportunidades de recompra."
                items={actionable.repurchaseWindow.map((item) => ({
                  key: `${item.purchaseId}-rep`,
                  headline: item.customerName,
                  detail: `${item.productName} · potencial $${formatCurrency(item.potentialValue)}`,
                  when: `Garantía vencida ${formatRelative(item.warrantyExpiresAt)}`,
                  href: item.customerUuid
                    ? `/customers/${item.customerUuid}`
                    : "/customers?warrantyExpiredInDays=365",
                }))}
                href="/customers?warrantyExpiredInDays=365"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-4 lg:grid-cols-12">
        <div className="col-span-4 lg:col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-primary" />
                Actividad reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed items={activity ?? null} />
            </CardContent>
          </Card>
        </div>
        <div className="col-span-4 lg:col-span-5">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-primary" />
                Campañas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CampaignsPanel data={campaigns ?? null} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionableColumn({
  icon,
  title,
  empty,
  items,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  items: Array<{ key: string; headline: string; detail: string; when: string; href?: string }>;
  href: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <h3 className="truncate">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href ?? href}
                className="block rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{item.headline}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {item.when}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {item.detail || "—"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={href}
        className={cn(
          "mt-2 inline-flex text-xs font-medium text-primary hover:underline",
        )}
      >
        Ver más →
      </Link>
    </div>
  );
}
