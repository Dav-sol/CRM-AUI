"use client";

import {
  ArrowRight,
  CalendarClock,
  Lightbulb,
  MessageSquareText,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const RECOMMENDATIONS = [
  {
    preset: "garantia",
    icon: CalendarClock,
    title: "Garantías por vencer",
    description:
      "1.240 baterías vencen su garantía en los próximos 30 días. Un seguimiento automático recupera clientes antes de que compren en otro lado.",
    action: "Crear seguimiento de garantía",
  },
  {
    preset: "reactivacion",
    icon: Users,
    title: "Clientes para reactivar",
    description:
      "380 clientes no han vuelto a comprar en los últimos 6 meses. Son tu mejor oportunidad de recompra sin costo de adquisición.",
    action: "Campaña de reactivación",
  },
  {
    preset: "bienvenida",
    icon: MessageSquareText,
    title: "Mensajes con alta entrega",
    description:
      "Tus seguimientos tienen un 92% de entrega estimada por WhatsApp. Cuanto antes actives, mayor es el impacto en recompra.",
    action: "Activar campaña de recompra",
  },
] as const;

export const INSIGHTS = [
  { icon: CalendarClock, label: "Garantías vencen en 30 días", value: "1.240", detail: "De 6.246 clientes activos, 1.240 tienen una compra cuya garantía expira en los próximos 30 días. Priorizarlos con un recordatorio automático reduce la fuga a la competencia." },
  { icon: Users, label: "Clientes elegibles para reactivación", value: "380", detail: "380 clientes sin recompra en los últimos 6 meses acumulan un valor potencial estimado de $114.000 USD. Una campaña de reactivación tiene una tasa esperada del 12-18%." },
  { icon: TrendingUp, label: "Clientes con garantía activa", value: "68%", detail: "El 68% de los clientes tiene al menos una garantía vigente. Cada garantía es una oportunidad de contacto post-venta y de futura recompra." },
  { icon: RefreshCcw, label: "Campañas recomendadas", value: "12", detail: "Según el comportamiento de compra, se recomiendan 12 campañas de seguimiento: garantía, recompra estacional y reactivación de inactivos." },
] as const;

type Insight = (typeof INSIGHTS)[number];

export function FollowUpRecommendations() {
  const [selected, setSelected] = useState<Insight | null>(null);

  return (
    <div className="space-y-5">
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Recomendador de seguimientos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sugerencias accionables para mantener a tus clientes cerca después de la venta.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 lg:grid-cols-3">
            {RECOMMENDATIONS.map((rec) => (
              <li
                key={rec.title}
                className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <rec.icon className="size-4" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold">{rec.title}</p>
                </div>
                <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                  {rec.description}
                </p>
                <Link
                  href={`/campaigns?crear=1&preset=${rec.preset}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "justify-between",
                  )}
                >
                  {rec.action}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-primary" />
            Hallazgos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Lo que tus datos de garantía y recompra revelan hoy. Tocá una tarjeta para ver el detalle.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {INSIGHTS.map((insight) => (
              <button
                key={insight.label}
                type="button"
                onClick={() => setSelected(insight)}
                className="rounded-lg border border-border/60 bg-muted/30 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <insight.icon className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-2 text-2xl font-semibold tracking-tight">{insight.value}</p>
                <p className="text-xs text-muted-foreground">{insight.label}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">Demo</Badge>
            Datos ilustrativos generados a partir de garantías y compras de la organización.
          </p>
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected?.label}</SheetTitle>
            <SheetDescription>
              {selected && (
                <div className="mt-2 space-y-3">
                  <p className="text-3xl font-bold tracking-tight">{selected.value}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selected.detail}
                  </p>
                </div>
              )}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  );
}