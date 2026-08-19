"use client";

import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
};

export function KpiCard({ icon: Icon, label, value, hint }: KpiCardProps) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className={cn("text-2xl font-bold tracking-tight")}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}