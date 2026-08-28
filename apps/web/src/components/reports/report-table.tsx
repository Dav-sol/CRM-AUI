"use client";

import { Download, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: (value: unknown, row: T) => string;
};

type ReportTableProps<T extends Record<string, unknown>> = {
  columns: Column<T>[];
  rows: T[];
  searchPlaceholder?: string;
  onExportCsv?: () => void;
};

export function ReportTable<T extends Record<string, unknown>>({
  columns,
  rows,
  searchPlaceholder = "Buscar...",
  onExportCsv,
}: ReportTableProps<T>) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter((row) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return columns.some((col) => {
      const val = row[col.key];
      return String(val ?? "").toLowerCase().includes(q);
    });
  });

  function handleExport() {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    // Default CSV export
    const headers = columns.map((c) => c.label).join(",");
    const csvRows = filtered.map((row) =>
      columns
        .map((col) => {
          const val = row[col.key];
          const str = String(val ?? "");
          return str.includes(",") || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    );
    const csv = [headers, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 size-3.5" />
          Exportar CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-xs font-medium text-muted-foreground ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Sin resultados
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-xs ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {col.format
                        ? col.format(row[col.key], row)
                        : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
