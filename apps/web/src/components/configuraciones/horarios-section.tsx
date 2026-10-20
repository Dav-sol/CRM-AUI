"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiGetConfigHorarios,
  apiUpdateConfigHorarios,
} from "@/lib/api";
import type { ConfigBusinessDay, ConfigHorarios } from "@/lib/sdk-types";

/**
 * Sección Horarios (specs/024-configuraciones-v1 §7, AU-009).
 *
 * Fuera de la ventana comercial la automatización se salta sin reprogramarse ni
 * contar reintento, así que esta sección explica ese efecto en la propia
 * pantalla. Con el horario desactivado no se restringe nada.
 */

const DAYS: { value: ConfigBusinessDay; label: string; short: string }[] = [
  { value: "MON", label: "Lunes", short: "L" },
  { value: "TUE", label: "Martes", short: "M" },
  { value: "WED", label: "Miércoles", short: "X" },
  { value: "THU", label: "Jueves", short: "J" },
  { value: "FRI", label: "Viernes", short: "V" },
  { value: "SAT", label: "Sábado", short: "S" },
  { value: "SUN", label: "Domingo", short: "D" },
];

type HorariosForm = {
  businessHoursEnabled: boolean;
  timezone: string;
  businessDays: ConfigBusinessDay[];
  start: string;
  end: string;
};

function minutesToInput(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function inputToMinutes(value: string): number | null {
  if (!value.trim()) return null;
  const [hh, mm] = value.split(":").map((part) => Number(part));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function toForm(horarios: ConfigHorarios): HorariosForm {
  return {
    businessHoursEnabled: horarios.businessHoursEnabled,
    timezone: horarios.timezone,
    businessDays: [...horarios.businessDays],
    start: minutesToInput(horarios.businessHoursStart),
    end: minutesToInput(horarios.businessHoursEnd),
  };
}

export function HorariosSection() {
  const [form, setForm] = useState<HorariosForm | null>(null);
  const [saved, setSaved] = useState<HorariosForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const horarios = await apiGetConfigHorarios();
        if (!cancelled) {
          const next = toForm(horarios);
          setForm(next);
          setSaved(next);
        }
      } catch (caught) {
        if (
          !cancelled &&
          !(caught instanceof ApiError && caught.status === 401)
        ) {
          setError("No se pudo cargar el horario comercial.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDay(day: ConfigBusinessDay) {
    if (!form) return;
    setForm({
      ...form,
      businessDays: form.businessDays.includes(day)
        ? form.businessDays.filter((item) => item !== day)
        : [...form.businessDays, day],
    });
    setNotice(null);
  }

  const dirty = form !== null && saved !== null && !sameForm(form, saved);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiUpdateConfigHorarios({
        businessHoursEnabled: form.businessHoursEnabled,
        timezone: form.timezone.trim(),
        businessDays: form.businessDays,
        businessHoursStart: inputToMinutes(form.start),
        businessHoursEnd: inputToMinutes(form.end),
      });
      const next = toForm(updated);
      setForm(next);
      setSaved(next);
      setNotice("Horario guardado.");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudo guardar el horario comercial.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section aria-labelledby="horarios-title" className="space-y-4">
        <h2
          id="horarios-title"
          className="text-base font-semibold tracking-tight"
        >
          Horario comercial
        </h2>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-full" />
      </section>
    );
  }

  if (!form) {
    return (
      <section aria-labelledby="horarios-title" className="space-y-2">
        <h2
          id="horarios-title"
          className="text-base font-semibold tracking-tight"
        >
          Horario comercial
        </h2>
        <p role="alert" className="text-sm text-destructive">
          {error ?? "No se pudo cargar el horario comercial."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="horarios-title" className="space-y-4">
      <div>
        <h2
          id="horarios-title"
          className="text-base font-semibold tracking-tight"
        >
          Horario comercial
        </h2>
        <p className="text-sm text-muted-foreground">
          Fuera de esta ventana las automatizaciones quedan pendientes y se
          ejecutan al entrar en horario, sin contar reintento.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={form.businessHoursEnabled}
          onChange={(event) => {
            setForm({ ...form, businessHoursEnabled: event.target.checked });
            setNotice(null);
          }}
        />
        Restringir los envíos a este horario
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="horarios-timezone">Zona horaria</Label>
          <Input
            id="horarios-timezone"
            value={form.timezone}
            maxLength={64}
            placeholder="America/Bogota"
            disabled={!form.businessHoursEnabled}
            onChange={(event) => {
              setForm({ ...form, timezone: event.target.value });
              setNotice(null);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="horarios-start">Desde</Label>
            <Input
              id="horarios-start"
              type="time"
              value={form.start}
              disabled={!form.businessHoursEnabled}
              onChange={(event) => {
                setForm({ ...form, start: event.target.value });
                setNotice(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horarios-end">Hasta</Label>
            <Input
              id="horarios-end"
              type="time"
              value={form.end}
              disabled={!form.businessHoursEnabled}
              onChange={(event) => {
                setForm({ ...form, end: event.target.value });
                setNotice(null);
              }}
            />
          </div>
        </div>
      </div>

      <fieldset className="space-y-2" disabled={!form.businessHoursEnabled}>
        <legend className="text-sm font-medium">Días</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const selected = form.businessDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={selected}
                title={day.label}
                onClick={() => toggleDay(day.value)}
                className={
                  selected
                    ? "size-9 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors motion-reduce:transition-none"
                    : "size-9 rounded-md border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted motion-reduce:transition-none"
                }
              >
                {day.short}
                <span className="sr-only">{day.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      <Button onClick={save} disabled={saving || !dirty}>
        {saving ? "Guardando…" : "Guardar horario"}
      </Button>
    </section>
  );
}

function sameForm(a: HorariosForm, b: HorariosForm): boolean {
  return (
    a.businessHoursEnabled === b.businessHoursEnabled &&
    a.timezone.trim() === b.timezone.trim() &&
    a.start === b.start &&
    a.end === b.end &&
    [...a.businessDays].sort().join(",") ===
      [...b.businessDays].sort().join(",")
  );
}
