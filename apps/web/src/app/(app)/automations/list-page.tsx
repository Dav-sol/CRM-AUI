"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  AutomationList,
  AutomationStatusBadge,
  useAutomations,
  type AutomationFilters,
} from "@/components/automations/automation-list";
import { AutomationDetailSheet } from "@/components/automations/automation-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const AUTOMATION_TABS: { label: string; value: AutomationFilters["status"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Programadas", value: "SCHEDULED" },
  { label: "Ejecutadas", value: "EXECUTED" },
  { label: "Canceladas", value: "CANCELLED" },
];

export function AutomationsIndexPage() {
  const [status, setStatus] = useState<AutomationFilters["status"]>(undefined);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const { items, meta, error } = useAutomations({ page, status, refreshKey });

  const totalPages = meta?.pages ?? 1;

  const upcoming =
    items
      ?.filter(
        (a) => a.status === "SCHEDULED" && new Date(a.scheduledDate).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
      )
      .slice(0, 4) ?? [];

  return (
    <div className="flex h-full w-full flex-col p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Automatizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Cada compra o campaña genera un mensaje de seguimiento automático en la fecha
            programada. Acá ves todo el pipeline.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Wand2 className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            ¿Preferís empezar con una plantilla lista?
          </p>
          <p className="text-xs text-muted-foreground">
            Creá un seguimiento desde una plantilla predefinida: bienvenida, recordatorio de
            garantía o reactivación.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Bienvenida", preset: "bienvenida" },
            { label: "Recordatorio de garantía", preset: "garantia" },
            { label: "Reactivación", preset: "reactivacion" },
          ].map((preset) => (
            <Link
              key={preset.preset}
              href={`/campaigns?crear=1&preset=${preset.preset}`}
              className="rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              {preset.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Próximas a ejecutarse */}
      <div className="mt-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Próximas a ejecutarse
        </h2>
        {items === null ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="mt-2 rounded-lg border border-border/60 bg-card p-3 text-sm text-muted-foreground">
            No hay mensajes programados para el futuro cercano.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((automation) => (
              <button
                key={automation.uuid}
                type="button"
                onClick={() => setSelectedAutomation(automation.uuid)}
                className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatRelative(automation.scheduledDate)}
                  </span>
                  <AutomationStatusBadge status={automation.status} />
                </div>
                <p className="mt-1.5 text-sm font-semibold">
                  {formatDateTime(automation.scheduledDate)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          {AUTOMATION_TABS.map((tabItem) => (
            <button
              key={tabItem.label}
              type="button"
              role="tab"
              aria-selected={status === tabItem.value}
              onClick={() => {
                setStatus(tabItem.value);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                status === tabItem.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          {meta ? `${meta.total} automatizaciones` : "Cargando…"}
        </Badge>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        <AutomationList
          items={items}
          error={error}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onSelect={(automation) => setSelectedAutomation(automation.uuid)}
        />
      </div>

      {meta && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {meta.total} resultados
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || items === null}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || items === null}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <AutomationDetailSheet
        uuid={selectedAutomation}
        onClose={() => setSelectedAutomation(null)}
      />
    </div>
  );
}