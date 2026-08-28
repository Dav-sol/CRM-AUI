"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { CreateCustomerSheet } from "@/components/customers/create-customer-sheet";
import { CustomerList, useCustomers } from "@/components/customers/customer-list";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Button } from "@/components/ui/button";
import { useListQuery } from "@/lib/use-list-query";

const CUSTOMER_SORT_OPTIONS = [
  { value: "-createdAt", label: "Creados (nuevo → viejo)" },
  { value: "createdAt", label: "Creados (viejo → nuevo)" },
  { value: "name", label: "Nombre (A → Z)" },
  { value: "-name", label: "Nombre (Z → A)" },
  { value: "city", label: "Ciudad" },
  { value: "status", label: "Estado" },
];

export function CustomersIndexPage() {
  const { state, set } = useListQuery({});
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, meta, error } = useCustomers({
    page: state.page,
    search: state.search,
    status: state.status,
    createdFrom: state.from,
    createdTo: state.to,
    sort: state.sort,
    refreshKey,
  });

  const totalPages = meta?.pages ?? 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {meta ? `${meta.total} clientes en la organización` : "Administrá tus clientes."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
            Actualizar
          </Button>
          <CreateCustomerSheet onCreated={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <div className="mt-4">
        <ListToolbar
          searchValue={state.search}
          onSearchChange={(search) => set({ search })}
          searchPlaceholder="Buscar por nombre, código, teléfono o email…"
          sort={state.sort}
          sortOptions={CUSTOMER_SORT_OPTIONS}
          onSortChange={(sort) => set({ sort })}
          filters={[
            {
              value: state.status,
              onChange: (status) => set({ status }),
              options: [
                { value: "ACTIVE", label: "Activos" },
                { value: "INACTIVE", label: "Inactivos" },
                { value: "PENDING", label: "Pendientes" },
                { value: "BLOCKED", label: "Bloqueados" },
              ],
              placeholder: "Estado",
              "aria-label": "Filtrar por estado",
            },
          ]}
        >
          <DateRangePicker
            value={{ from: state.from, to: state.to, compareFrom: state.compareFrom, compareTo: state.compareTo }}
            onChange={(range) =>
              set({ from: range.from, to: range.to, compareFrom: range.compareFrom, compareTo: range.compareTo })
            }
          />
        </ListToolbar>
      </div>

      <div className="mt-4">
        <CustomerList items={items} error={error} />
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
    </div>
  );
}