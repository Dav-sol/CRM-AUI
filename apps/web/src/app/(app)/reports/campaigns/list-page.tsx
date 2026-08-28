"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ReportKpi } from "@/components/reports/report-kpi";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiReportCampaigns,
  type ReportParams,
  type CampaignReport,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function CampaignReportPage() {
  const [params, setParams] = useState<ReportParams>({ groupBy: "month" });
  const [data, setData] = useState<CampaignReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiReportCampaigns(params);
        if (!cancelled) setData(result);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError("Error al cargar el reporte.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [params]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/reports"
          className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-card transition-colors hover:bg-muted/50"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reporte de Campañas
          </h1>
          <p className="text-sm text-muted-foreground">
            Enviados, entregados, respondidos, ventas, ROI.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportKpi label="Total" value={data.summary.total} />
            <ReportKpi label="Activas" value={data.summary.active} />
            <ReportKpi label="Finalizadas" value={data.summary.finished} />
            <ReportKpi label="Enviados" value={data.summary.totalSent} />
            <ReportKpi label="Entregados" value={data.summary.totalDelivered} />
            <ReportKpi
              label="Respondidos"
              value={data.summary.totalResponded}
            />
            <ReportKpi label="Ventas" value={data.summary.totalSales} />
            <ReportKpi
              label="Ingresos"
              value={formatCurrency(data.summary.totalRevenue)}
            />
          </div>

          <ReportFilters params={params} onChange={setParams} />

          <ReportTable
            columns={[
              { key: "label", label: "Nombre" },
              { key: "status", label: "Estado" },
              { key: "type", label: "Tipo" },
              { key: "value", label: "Mensajes", align: "right" },
              { key: "delivered", label: "Entregados", align: "right" },
              { key: "responded", label: "Respondidos", align: "right" },
              { key: "sales", label: "Ventas", align: "right" },
              {
                key: "revenue",
                label: "Ingresos",
                align: "right",
                format: (val) => formatCurrency(val as number),
              },
            ]}
            rows={data.rows}
            searchPlaceholder="Buscar campaña..."
          />
        </>
      ) : null}
    </div>
  );
}
