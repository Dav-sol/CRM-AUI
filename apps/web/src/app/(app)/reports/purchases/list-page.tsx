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
  apiReportPurchases,
  type ReportParams,
  type PurchaseReport,
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function PurchaseReportPage() {
  const [params, setParams] = useState<ReportParams>({ groupBy: "month" });
  const [data, setData] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiReportPurchases(params);
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
            Reporte de Compras
          </h1>
          <p className="text-sm text-muted-foreground">
            Valor, unidades, ticket promedio, por período.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ReportKpi label="Total" value={data.summary.total} />
            <ReportKpi
              label="Valor total"
              value={formatCurrency(data.summary.totalValue)}
            />
            <ReportKpi
              label="Unidades período"
              value={data.summary.unitsInPeriod}
            />
            <ReportKpi
              label="Valor período"
              value={formatCurrency(data.summary.valueInPeriod)}
            />
            <ReportKpi
              label="Ticket promedio"
              value={formatCurrency(data.summary.avgTicket)}
            />
          </div>

          <ReportFilters params={params} onChange={setParams} />

          <ReportTable
            columns={[
              { key: "label", label: "Período" },
              { key: "value", label: "Unidades", align: "right" },
              {
                key: "totalValue",
                label: "Valor",
                align: "right",
                format: (val) => formatCurrency(val as number),
              },
            ]}
            rows={data.rows}
            searchPlaceholder="Buscar período..."
          />
        </>
      ) : null}
    </div>
  );
}
