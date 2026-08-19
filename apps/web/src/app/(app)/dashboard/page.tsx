"use client";

import {
  CalendarClock,
  MessageSquareText,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiDashboardActivity, apiDashboardCampaigns, apiDashboardSummary } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export default function DashboardPage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof apiDashboardSummary>> | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof apiDashboardActivity>> | null>(null);
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof apiDashboardCampaigns>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryData, activityData, campaignsData] = await Promise.all([
          apiDashboardSummary(),
          apiDashboardActivity(),
          apiDashboardCampaigns(),
        ]);
        if (cancelled) {
          return;
        }
        setSummary(summaryData);
        setActivity(activityData);
        setCampaigns(campaignsData);
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
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumen de la operación de hoy.</p>
        </div>
        <Link
          href="/conversations"
          className={buttonVariants({ variant: "outline" })}
        >
          <MessageSquareText />
          Ver conversaciones
        </Link>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12">
        <div className="col-span-2 md:col-span-2 lg:col-span-3">
          {summary ? (
            <KpiCard
              icon={Users}
              label="Clientes"
              value={formatNumber(summary.customers.total)}
              hint={`${formatNumber(summary.customers.newThisMonth)} nuevos este mes`}
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div className="col-span-2 md:col-span-2 lg:col-span-3">
          {summary ? (
            <KpiCard
              icon={ShoppingCart}
              label="Compras"
              value={formatNumber(summary.purchases.total)}
              hint={`${formatNumber(summary.purchases.thisMonth)} este mes`}
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div className="col-span-2 md:col-span-2 lg:col-span-3">
          {summary ? (
            <KpiCard
              icon={MessageSquareText}
              label="Mensajes enviados"
              value={formatNumber(summary.messages.sent)}
              hint={`${formatNumber(summary.messages.pending)} en cola`}
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
        <div className="col-span-2 md:col-span-2 lg:col-span-3">
          {summary ? (
            <KpiCard
              icon={Workflow}
              label="Conversaciones activas"
              value={formatNumber(summary.conversations.open)}
              hint={`${formatNumber(summary.campaigns.active)} campañas activas`}
            />
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12">
        <div className="col-span-4 md:col-span-8 lg:col-span-7">
          <Card>
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
        <div className="col-span-4 md:col-span-8 lg:col-span-5">
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
      </div>
    </div>
  );
}