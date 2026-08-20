"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  AutomationList,
  useAutomations,
  type AutomationFilters,
} from "@/components/automations/automation-list";
import { AutomationDetailSheet } from "@/components/automations/automation-detail";
import {
  CommercialCycleList,
  CycleDetailSheet,
  useCommercialCycles,
  type CommercialCycleFilters,
} from "@/components/automations/commercial-cycle-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTOMATION_TABS: { label: string; value: AutomationFilters["status"] }[] = [
  { label: "Todas", value: undefined },
  { label: "Pendientes", value: "PENDING" },
  { label: "Programadas", value: "SCHEDULED" },
  { label: "Ejecutadas", value: "EXECUTED" },
  { label: "Canceladas", value: "CANCELLED" },
  { label: "Error", value: "ERROR" },
  { label: "Pausadas", value: "PAUSED" },
];

const CYCLE_TABS: { label: string; value: CommercialCycleFilters["status"] }[] = [
  { label: "Todos", value: undefined },
  { label: "Activos", value: "ACTIVE" },
  { label: "Finalizados", value: "FINISHED" },
  { label: "Cancelados", value: "CANCELLED" },
];

type Tab = "automations" | "cycles";

export function AutomationsIndexPage() {
  const [tab, setTab] = useState<Tab>("automations");
  const [status, setStatus] = useState<AutomationFilters["status"]>(undefined);
  const [cycleStatus, setCycleStatus] = useState<CommercialCycleFilters["status"]>(undefined);
  const [page, setPage] = useState(1);
  const [cyclePage, setCyclePage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);

  const { items, meta, error } = useAutomations({ page, status, refreshKey });
  const { items: cycles, meta: cycleMeta, error: cycleError } = useCommercialCycles({
    page: cyclePage,
    status: cycleStatus,
    refreshKey,
  });

  const totalPages = tab === "automations" ? (meta?.pages ?? 1) : (cycleMeta?.pages ?? 1);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Automatizaciones</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "automations"
              ? meta
                ? `${meta.total} automatizaciones`
                : "Seguimiento programado por campañas."
              : cycleMeta
                ? `${cycleMeta.total} ciclos comerciales`
                : "Ciclos de seguimiento por compra."}
          </p>
        </div>
        <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "automations"}
            onClick={() => setTab("automations")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
              tab === "automations"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Automatizaciones
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cycles"}
            onClick={() => setTab("cycles")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
              tab === "cycles"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Ciclos comerciales
          </button>
        </div>
        {tab === "automations" ? (
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
        ) : (
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="tablist">
            {CYCLE_TABS.map((tabItem) => (
              <button
                key={tabItem.label}
                type="button"
                role="tab"
                aria-selected={cycleStatus === tabItem.value}
                onClick={() => {
                  setCycleStatus(tabItem.value);
                  setCyclePage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                  cycleStatus === tabItem.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
        {tab === "automations" ? (
          <AutomationList
            items={items}
            error={error}
            onChanged={() => setRefreshKey((k) => k + 1)}
            onSelect={(automation) => setSelectedAutomation(automation.uuid)}
          />
        ) : (
          <CommercialCycleList
            items={cycles}
            error={cycleError}
            onSelect={(cycle) => setSelectedCycle(cycle.uuid)}
          />
        )}
      </div>

      {tab === "automations" ? meta && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={meta.total}
          loading={items === null}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      ) : cycleMeta && (
        <Pagination
          page={cyclePage}
          totalPages={totalPages}
          total={cycleMeta.total}
          loading={cycles === null}
          onPrev={() => setCyclePage((p) => Math.max(1, p - 1))}
          onNext={() => setCyclePage((p) => p + 1)}
        />
      )}

      <AutomationDetailSheet
        uuid={selectedAutomation}
        onClose={() => setSelectedAutomation(null)}
      />
      <CycleDetailSheet uuid={selectedCycle} onClose={() => setSelectedCycle(null)} />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Página {page} de {totalPages} · {total} resultados
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={onPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || loading}
          onClick={onNext}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}