"use client";

import { Calendar } from "lucide-react";

import type { ReportParams } from "@/lib/api";

const GROUP_OPTIONS = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
] as const;

type ReportFiltersProps = {
  params: ReportParams;
  onChange: (params: ReportParams) => void;
  showGroupBy?: boolean;
};

export function ReportFilters({
  params,
  onChange,
  showGroupBy = true,
}: ReportFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="size-4 text-muted-foreground" />
        <label className="text-xs text-muted-foreground">Desde</label>
        <input
          type="date"
          value={params.from ?? ""}
          onChange={(e) => onChange({ ...params, from: e.target.value || undefined })}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Hasta</label>
        <input
          type="date"
          value={params.to ?? ""}
          onChange={(e) => onChange({ ...params, to: e.target.value || undefined })}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
        />
      </div>
      {showGroupBy && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Agrupar</label>
          <select
            value={params.groupBy ?? "month"}
            onChange={(e) =>
              onChange({
                ...params,
                groupBy: e.target.value as ReportParams["groupBy"],
              })
            }
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
          >
            {GROUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
