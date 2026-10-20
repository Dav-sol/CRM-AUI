"use client";

import {
  AlertTriangle,
  CalendarClock,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CampaignsPanel } from "@/components/dashboard/campaigns-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiDashboardActionable,
  apiDashboardCampaigns,
  apiDashboardSummary,
} from "@/lib/api";
import { formatCivilDateTime, formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Actionable = Awaited<ReturnType<typeof apiDashboardActionable>>;

export default function DashboardPage() {
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof apiDashboardSummary>
  > | null>(null);
  const [campaigns, setCampaigns] = useState<Awaited<
    ReturnType<typeof apiDashboardCampaigns>
  > | null>(null);
  const [actionable, setActionable] = useState<Actionable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryData, campaignsData, actionableData] =
          await Promise.all([
            apiDashboardSummary({}),
            apiDashboardCampaigns(),
            apiDashboardActionable(),
          ]);
        if (cancelled) return;
        setSummary(summaryData);
        setCampaigns(campaignsData);
        setActionable(actionableData);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return;
        setError("No se pudieron cargar los datos del dashboard.");
        toast.error("Error al cargar el dashboard");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const expiringCount = actionable?.expiringWarranties.length ?? 0;
  const expiredCount = actionable?.repurchaseWindow.length ?? 0;

  return (
    <div className="w-full space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Qué está pasando y qué requiere tu atención hoy.
          </p>
        </div>
        <Link
          href="/purchases"
          className={buttonVariants({ variant: "default" })}
        >
          <Plus className="size-4" />
          Registrar venta
        </Link>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Qué hacer hoy — hero */}
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
                icon={<AlertTriangle className="size-4 text-amber-500" />}
                title="Garantías por vencer"
                empty="Sin garantías próximas a vencer."
                items={actionable.expiringWarranties.map((item) => ({
                  key: `${item.purchaseId}-exp`,
                  headline: item.customerName,
                  detail: item.productName,
                  when: `Vence ${formatCivilDateTime(item.warrantyExpiresAt)}`,
                  href: item.customerUuid
                    ? `/customers/${item.customerUuid}`
                    : "/customers",
                }))}
                href="/customers"
              />
              <ActionableColumn
                icon={<RefreshCcw className="size-4 text-emerald-500" />}
                title="Garantías vencidas"
                empty="Sin garantías vencidas."
                items={actionable.repurchaseWindow.map((item) => ({
                  key: `${item.purchaseId}-rep`,
                  headline: item.customerName,
                  detail: `${item.productName} · potencial $${formatCurrency(item.potentialValue)}`,
                  when: `Vencida ${formatRelative(item.warrantyExpiresAt)}`,
                  href: item.customerUuid
                    ? `/customers/${item.customerUuid}`
                    : "/customers",
                }))}
                href="/customers"
              />
              <ActionableColumn
                icon={<CalendarClock className="size-4 text-primary" />}
                title="Próximos seguimientos"
                empty="Sin seguimientos programados."
                items={actionable.upcomingAutomations.map((item) => ({
                  key: item.uuid,
                  headline: item.customerName,
                  detail: [item.campaignName ?? "", item.productName]
                    .filter(Boolean)
                    .join(" · "),
                  when: formatRelative(item.scheduledDate),
                  href: item.customerUuid
                    ? `/customers/${item.customerUuid}`
                    : "/customers",
                }))}
                href="/customers"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs de oportunidades */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div>
          {summary ? (
            <KpiCard
              icon={AlertTriangle}
              label="Garantías por vencer"
              value={formatNumber(expiringCount)}
              hint="Próximos 30 días"
              href="/customers"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={RefreshCcw}
              label="Garantías vencidas"
              value={formatNumber(expiredCount)}
              hint="Oportunidades de recompra"
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
              label="Compras este mes"
              value={formatNumber(summary.purchases.thisMonth)}
              hint={`$${formatCurrency(summary.purchases.value)}`}
              href="/purchases"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div>
          {summary ? (
            <KpiCard
              icon={Users}
              label="Total clientes"
              value={formatNumber(summary.customers.total)}
              hint={`${formatNumber(summary.customers.newInRange)} nuevos`}
              href="/customers"
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
      </div>

      {/* Campañas */}
      <Card>
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
