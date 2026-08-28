"use client";

import {
  BadgePercent,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";

import {
  AutomationList,
  AutomationStatusBadge,
  useAutomations,
  useAutomationsRail,
  useUpcomingAutomations,
  useWarrantiesSoonRail,
} from "@/components/automations/automation-list";
import { AutomationDetailSheet } from "@/components/automations/automation-detail";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { useListQuery } from "@/lib/use-list-query";
import type { AutomationItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";

const AUTOMATION_TABS: { label: string; value?: string }[] = [
  { label: "Todas", value: undefined },
  { label: "Programadas", value: "SCHEDULED" },
  { label: "Ejecutadas", value: "EXECUTED" },
  { label: "Con error", value: "ERROR" },
  { label: "Canceladas", value: "CANCELLED" },
];

const AUTOMATION_SORT_OPTIONS = [
  { value: "-scheduledDate", label: "Programada (nueva → vieja)" },
  { value: "scheduledDate", label: "Programada (vieja → nueva)" },
  { value: "-createdAt", label: "Creada (nueva → vieja)" },
  { value: "createdAt", label: "Creada (vieja → nueva)" },
  { value: "status", label: "Estado" },
];

export function AutomationsIndexPage() {
  const { state, set } = useListQuery({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(
    null,
  );

  const status = state.status as
    | "SCHEDULED"
    | "EXECUTED"
    | "ERROR"
    | "CANCELLED"
    | undefined;

  const { items, meta, error } = useAutomations({
    page: state.page,
    status,
    search: state.search,
    sort: state.sort,
    scheduledFrom: state.from,
    scheduledTo: state.to,
    refreshKey,
  });
  const upcoming = useUpcomingAutomations(refreshKey);
  const recompra = useAutomationsRail(
    { purpose: "COMMERCIAL", sort: "-scheduledDate" },
    refreshKey,
  );
  const warrantiesSoon = useWarrantiesSoonRail(refreshKey);

  const totalPages = meta?.pages ?? 1;

  return (
    <div className="w-full space-y-5 p-4 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Automatizaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada compra o campaña genera un mensaje de seguimiento automático en
            la fecha programada. Acá ves todo el pipeline.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>

      <details className="mt-4 rounded-lg border border-border/60 p-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
          Ver por prioridad (Próximas / Recompra / Garantías)
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <AutomationRail
            title="Próximas a ejecutarse"
            icon={<CalendarClock className="size-4 text-primary" aria-hidden="true" />}
            items={upcoming.items}
            empty="Sin mensajes programados para el futuro cercano."
            onSelect={setSelectedAutomation}
          />
          <AutomationRail
            title="Recompra / renovación"
            icon={<BadgePercent className="size-4 text-primary" aria-hidden="true" />}
            items={recompra.items}
            empty="Sin oportunidades de renovación activas."
            onSelect={setSelectedAutomation}
          />
          <AutomationRail
            title="Garantías próximas a vencer"
            icon={<ShieldAlert className="size-4 text-primary" aria-hidden="true" />}
            items={warrantiesSoon.items}
            empty="Sin garantías por vencer en los próximos 60 días."
            onSelect={setSelectedAutomation}
          />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-1 rounded-lg bg-muted p-1"
          role="tablist"
        >
          {AUTOMATION_TABS.map((tabItem) => (
            <button
              key={tabItem.label}
              type="button"
              role="tab"
              aria-selected={status === tabItem.value}
              onClick={() =>
                set({ status: tabItem.value, page: 1 })
              }
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

      <div className="mt-3">
        <ListToolbar
          searchValue={state.search}
          onSearchChange={(search) => set({ search })}
          searchPlaceholder="Buscar cliente o producto…"
          sort={state.sort}
          sortOptions={AUTOMATION_SORT_OPTIONS}
          onSortChange={(sort) => set({ sort })}
        >
          <DateRangePicker
            value={{
              from: state.from,
              to: state.to,
              compareFrom: state.compareFrom,
              compareTo: state.compareTo,
            }}
            onChange={(range) =>
              set({
                from: range.from,
                to: range.to,
                compareFrom: range.compareFrom,
                compareTo: range.compareTo,
              })
            }
          />
        </ListToolbar>
      </div>

<div className="mt-4">
        <AutomationList
          items={items}
          error={error}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onSelect={(a) => setSelectedAutomation(a.uuid)}
        />
      </div>

      {meta && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Página {state.page} de {totalPages} · {meta.total} resultados
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={state.page <= 1 || items === null}
              onClick={() => set({ page: Math.max(1, state.page - 1) })}
              aria-label="Página anterior"
            >
              <ChevronLeft />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={state.page >= totalPages || items === null}
              onClick={() => set({ page: state.page + 1 })}
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

type AutomationRailProps = {
  title: string;
  icon: React.ReactNode;
  items: AutomationItem[] | null;
  empty: string;
  onSelect: (uuid: string) => void;
};

function AutomationRail({ title, icon, items, empty, onSelect }: AutomationRailProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        {icon}
        {title}
      </h3>
      {items === null ? (
        <div className="mt-2 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((automation) => (
            <button
              key={automation.uuid}
              type="button"
              onClick={() => onSelect(automation.uuid)}
              className="w-full rounded-md border border-border/40 p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold">
                  {automation.customer?.name ?? "Cliente"}
                </span>
                <AutomationStatusBadge status={automation.status} />
              </div>
              <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/80">
                {automation.stageName ?? automation.campaign?.name ?? "Seguimiento"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {automation.productName}
                {automation.campaign?.name ? ` · ${automation.campaign.name}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatRelative(automation.scheduledDate)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
