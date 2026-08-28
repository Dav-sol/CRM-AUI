"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  // P0.1: destino del drill-down al hacer clic en la tarjeta.
  href?: string;
  // Google Ads style: percent change vs the previous period (null = no comparison).
  delta?: number | null;
};

function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        sin comparación
      </span>
    );
  }
  const positive = delta >= 0;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium",
        positive ? "text-emerald-600" : "text-destructive",
      )}
      aria-label={`${positive ? "Aumentó" : "Disminuyó"} ${Math.abs(delta)}% vs el período anterior`}
    >
      {positive ? (
        <ArrowUpRight className="size-3" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3" aria-hidden="true" />
      )}
      {Math.abs(delta)}%
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, hint, href, delta }: KpiCardProps) {
  const content = (
    <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight")}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <DeltaBadge delta={delta} />
    </CardContent>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full">{content}</Card>
    </Link>
  ) : (
    <Card className="h-full">{content}</Card>
  );
}