"use client";

import {
  BarChart3,
  FileText,
  MessageSquare,
  ShoppingCart,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";

const REPORTS = [
  {
    href: "/reports/customers",
    icon: Users,
    title: "Clientes",
    description: "Nuevos, pendientes de contacto, por período",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950",
  },
  {
    href: "/reports/purchases",
    icon: ShoppingCart,
    title: "Compras",
    description: "Valor, unidades, ticket promedio, por período",
    color: "text-green-600 bg-green-50 dark:bg-green-950",
  },
  {
    href: "/reports/campaigns",
    icon: BarChart3,
    title: "Campañas",
    description: "Enviados, entregados, respondidos, ventas, ROI",
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950",
  },
  {
    href: "/reports/automations",
    icon: Workflow,
    title: "Automatizaciones",
    description: "Pendientes, ejecutadas, errores, tasa de éxito",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950",
  },
  {
    href: "/reports/messages",
    icon: MessageSquare,
    title: "Mensajes",
    description: "Enviados, entregados, leídos, fallidos",
    color: "text-teal-600 bg-teal-50 dark:bg-teal-950",
  },
];

export function ReportsIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Indicadores para la gerencia. Selecciona un reporte para ver los
          detalles.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="group flex items-start gap-4 rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-border hover:shadow-sm"
          >
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${report.color}`}
            >
              <report.icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold group-hover:text-primary">
                {report.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {report.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
