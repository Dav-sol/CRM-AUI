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
  apiReportMessages,
  type ReportParams,
  type MessageReport,
} from "@/lib/api";

export function MessageReportPage() {
  const [params, setParams] = useState<ReportParams>({ groupBy: "month" });
  const [data, setData] = useState<MessageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiReportMessages(params);
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
            Reporte de Mensajes
          </h1>
          <p className="text-sm text-muted-foreground">
            Enviados, entregados, leídos, fallidos.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <ReportKpi label="Total" value={data.summary.total} />
            <ReportKpi label="Enviados" value={data.summary.sent} />
            <ReportKpi label="Entregados" value={data.summary.delivered} />
            <ReportKpi label="Leídos" value={data.summary.read} />
            <ReportKpi label="Fallidos" value={data.summary.failed} />
            <ReportKpi
              label="Tasa entrega"
              value={`${data.summary.deliveryRate.toFixed(1)}%`}
            />
          </div>

          <ReportFilters params={params} onChange={setParams} />

          <ReportTable
            columns={[
              { key: "label", label: "Período" },
              { key: "value", label: "Total", align: "right" },
              { key: "sent", label: "Enviados", align: "right" },
              { key: "failed", label: "Fallidos", align: "right" },
            ]}
            rows={data.rows}
            searchPlaceholder="Buscar período..."
          />
        </>
      ) : null}
    </div>
  );
}
