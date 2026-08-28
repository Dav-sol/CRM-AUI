"use client";

import { CalendarRange } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DateRange = {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
};

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

const PRESETS: Array<{
  label: string;
  range: () => { from: string; to: string };
}> = [
  { label: "Hoy", range: () => { const t = iso(new Date()); return { from: t, to: t }; } },
  { label: "Ayer", range: () => { const d = iso(daysAgo(1)); return { from: d, to: d }; } },
  { label: "Últimos 7 días", range: () => ({ from: iso(daysAgo(6)), to: iso(new Date()) }) },
  { label: "Últimos 14 días", range: () => ({ from: iso(daysAgo(13)), to: iso(new Date()) }) },
  { label: "Últimos 30 días", range: () => ({ from: iso(daysAgo(29)), to: iso(new Date()) }) },
  {
    label: "Este mes",
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(from), to: iso(now) };
    },
  },
  {
    label: "Mes pasado",
    range: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    },
  },
  { label: "Último trimestre", range: () => ({ from: iso(daysAgo(89)), to: iso(new Date()) }) },
  { label: "Último año", range: () => ({ from: iso(daysAgo(364)), to: iso(new Date()) }) },
];

function previousPeriod(range: { from: string; to: string }): {
  compareFrom: string;
  compareTo: string;
} {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const compareFrom = new Date(from.getTime() - days * 86_400_000);
  const compareTo = new Date(from.getTime() - 86_400_000);
  return { compareFrom: iso(compareFrom), compareTo: iso(compareTo) };
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from ?? "");
  const [customTo, setCustomTo] = useState(value.to ?? "");
  const [compare, setCompare] = useState(Boolean(value.compareFrom));

  const activeLabel = value.from && value.to ? `${value.from} → ${value.to}` : null;

  function apply(range: { from: string; to: string }) {
    onChange({
      ...range,
      ...(compare ? previousPeriod(range) : {}),
    });
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) {
      return;
    }
    const range = { from: customFrom, to: customTo };
    apply(range);
  }

  function clear() {
    onChange({});
    setOpen(false);
  }

  function toggleCompare(next: boolean) {
    setCompare(next);
    if (next && value.from && value.to) {
      const range = { from: value.from, to: value.to };
      onChange({ ...range, ...previousPeriod(range) });
    } else {
      onChange({ from: value.from, to: value.to });
    }
  }

  const inputClass =
    "h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none transition-colors focus:border-primary/50";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2 font-normal", className)}
            aria-label="Filtrar por fechas"
          />
        }
      >
        <CalendarRange className="size-4" aria-hidden="true" />
        {activeLabel ?? "Fechas"}
        {value.compareFrom && (
          <span className="hidden text-[11px] text-muted-foreground md:inline">
            (comp. {value.compareFrom} → {value.compareTo})
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => apply(preset.range())}
              className={cn(
                "rounded-md border border-border/60 px-2 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5",
                value.from &&
                  value.to &&
                  PRESETS.some(
                    (p) =>
                      p.label === preset.label &&
                      p.range().from === value.from &&
                      p.range().to === value.to,
                  )
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            Desde
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            Hasta
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={applyCustom}
            disabled={!customFrom || !customTo}
          >
            Aplicar
          </Button>
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={compare}
            onChange={(event) => toggleCompare(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          Comparar con el período anterior
        </label>

        {(value.from || value.to) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 self-start text-muted-foreground"
            onClick={clear}
          >
            Limpiar fechas
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}