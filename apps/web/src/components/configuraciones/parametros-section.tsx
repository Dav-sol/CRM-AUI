"use client";

import { useEffect, useMemo, useState } from "react";

import { SourceBadge } from "@/components/configuraciones/source-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiGetConfigParametros,
  apiUpdateConfigParametros,
} from "@/lib/api";
import type { ConfigParametros } from "@/lib/sdk-types";

/**
 * Sección Parámetros (specs/024-configuraciones-v1 §6).
 *
 * Cada campo muestra su origen (`Configurado` / `Del servidor` / `Por
 * defecto`) porque el valor efectivo se resuelve `BD > env > default`: lo que
 * el administrador ve puede venir de la instalación y no de esta pantalla.
 * Solo se envían los campos modificados, porque el PATCH es parcial.
 */

type ParametrosForm = {
  maxCommercialPer60d: string;
  minDaysBetweenCommercial: string;
  quoteExpiryDays: string;
  whatsappMessageCost: string;
  whatsappMessageCostCommercial: string;
  smsCostPerSegment: string;
  smsCurrency: string;
};

function toForm(parametros: ConfigParametros): ParametrosForm {
  return {
    maxCommercialPer60d: String(parametros.maxCommercialPer60d.valor),
    minDaysBetweenCommercial: String(parametros.minDaysBetweenCommercial.valor),
    quoteExpiryDays: String(parametros.quoteExpiryDays.valor),
    whatsappMessageCost: String(parametros.whatsappMessageCost.valor),
    whatsappMessageCostCommercial: String(
      parametros.whatsappMessageCostCommercial.valor,
    ),
    smsCostPerSegment: String(parametros.smsCostPerSegment.valor),
    smsCurrency: String(parametros.smsCurrency.valor),
  };
}

export function ParametrosSection() {
  const [parametros, setParametros] = useState<ConfigParametros | null>(null);
  const [form, setForm] = useState<ParametrosForm | null>(null);
  const [saved, setSaved] = useState<ParametrosForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiGetConfigParametros();
        if (!cancelled) {
          const next = toForm(data);
          setParametros(data);
          setForm(next);
          setSaved(next);
        }
      } catch (caught) {
        if (
          !cancelled &&
          !(caught instanceof ApiError && caught.status === 401)
        ) {
          setError("No se pudieron cargar los parámetros.");
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

  const changedKeys = useMemo(() => {
    if (!form || !saved) return [] as (keyof ParametrosForm)[];
    return (Object.keys(form) as (keyof ParametrosForm)[]).filter(
      (key) => form[key].trim() !== saved[key].trim(),
    );
  }, [form, saved]);

  function change(field: keyof ParametrosForm, value: string) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setNotice(null);
  }

  async function save() {
    if (!form || changedKeys.length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // PATCH parcial: solo los campos tocados, para no pisar el resto.
      const body: Record<string, number | string> = {};
      for (const key of changedKeys) {
        if (key === "smsCurrency") {
          body[key] = form[key].trim().toUpperCase();
          continue;
        }
        const parsed = Number(form[key]);
        if (Number.isNaN(parsed)) {
          setError(`El valor de "${key}" debe ser un número.`);
          setSaving(false);
          return;
        }
        body[key] = parsed;
      }
      const updated = await apiUpdateConfigParametros(body);
      const next = toForm(updated);
      setParametros(updated);
      setForm(next);
      setSaved(next);
      setNotice("Parámetros guardados.");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudieron guardar los parámetros.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section aria-labelledby="parametros-title" className="space-y-4">
        <h2
          id="parametros-title"
          className="text-base font-semibold tracking-tight"
        >
          Parámetros
        </h2>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </section>
    );
  }

  if (!form || !parametros) {
    return (
      <section aria-labelledby="parametros-title" className="space-y-2">
        <h2
          id="parametros-title"
          className="text-base font-semibold tracking-tight"
        >
          Parámetros
        </h2>
        <p role="alert" className="text-sm text-destructive">
          {error ?? "No se pudieron cargar los parámetros."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="parametros-title" className="space-y-4">
      <div>
        <h2
          id="parametros-title"
          className="text-base font-semibold tracking-tight"
        >
          Parámetros
        </h2>
        <p className="text-sm text-muted-foreground">
          Un valor configurado aquí tiene prioridad sobre el del servidor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ParametroField
          id="param-max-comercial"
          label="Máximo de mensajes comerciales en 60 días"
          value={form.maxCommercialPer60d}
          source={parametros.maxCommercialPer60d.source}
          onChange={(value) => change("maxCommercialPer60d", value)}
        />
        <ParametroField
          id="param-min-dias"
          label="Días mínimos entre mensajes comerciales"
          value={form.minDaysBetweenCommercial}
          source={parametros.minDaysBetweenCommercial.source}
          onChange={(value) => change("minDaysBetweenCommercial", value)}
        />
        <ParametroField
          id="param-quote-expiry"
          label="Días de vigencia de una cotización"
          value={form.quoteExpiryDays}
          source={parametros.quoteExpiryDays.source}
          onChange={(value) => change("quoteExpiryDays", value)}
        />
        <ParametroField
          id="param-wa-cost"
          label="Costo estimado WhatsApp (no comercial)"
          value={form.whatsappMessageCost}
          source={parametros.whatsappMessageCost.source}
          onChange={(value) => change("whatsappMessageCost", value)}
        />
        <ParametroField
          id="param-wa-cost-commercial"
          label="Costo estimado WhatsApp (comercial)"
          value={form.whatsappMessageCostCommercial}
          source={parametros.whatsappMessageCostCommercial.source}
          onChange={(value) => change("whatsappMessageCostCommercial", value)}
        />
        <ParametroField
          id="param-sms-segment"
          label="Costo estimado por segmento SMS"
          value={form.smsCostPerSegment}
          source={parametros.smsCostPerSegment.source}
          onChange={(value) => change("smsCostPerSegment", value)}
        />
        <ParametroField
          id="param-sms-currency"
          label="Moneda de los costos estimados"
          value={form.smsCurrency}
          source={parametros.smsCurrency.source}
          maxLength={3}
          onChange={(value) => change("smsCurrency", value.toUpperCase())}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      <Button onClick={save} disabled={saving || changedKeys.length === 0}>
        {saving ? "Guardando…" : "Guardar parámetros"}
      </Button>
    </section>
  );
}

function ParametroField({
  id,
  label,
  value,
  source,
  onChange,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  source: ConfigParametros["quoteExpiryDays"]["source"];
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <SourceBadge source={source} />
      </div>
      <Input
        id={id}
        inputMode={maxLength ? "text" : "numeric"}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
