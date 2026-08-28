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
  apiReportCustomers,
  type ReportParams,
  type CustomerReport,
} from "@/lib/api";

export function CustomerReportPage() {
  const [params, setParams] = useState<ReportParams>({ groupBy: "month" });
  const [data, setData] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiReportCustomers(params);
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
            Reporte de Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Nuevos, pendientes de contacto, por período.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
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
            <ReportKpi label="En período" value={data.summary.newInPeriod} />
            <ReportKpi
              label="Pendientes contacto"
              value={data.summary.pendingContact}
            />
            <ReportKpi label="Bloqueados" value={data.summary.blocked} />
          </div>

          <ReportFilters params={params} onChange={setParams} />

          <ReportTable
            columns={[
              { key: "label", label: "Período" },
              { key: "value", label: "Nuevos", align: "right" },
            ]}
            rows={data.rows}
            searchPlaceholder="Buscar período..."
          />
        </>
      ) : null}
    </div>
  );
}
