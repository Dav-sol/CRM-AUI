"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGetMiEmpresa, apiUpdateMiEmpresa } from "@/lib/api";
import type { MiEmpresa } from "@/lib/sdk-types";

/**
 * Sección Empresa (specs/024-configuraciones-v1 §2). El NIT, el email, el
 * teléfono y la ciudad son los datos que el usuario puede corregir; el slug y
 * el estado no se editan aquí (AC-10).
 */
type EmpresaForm = {
  name: string;
  nit: string;
  email: string;
  phone: string;
  city: string;
};

const EMPTY: EmpresaForm = {
  name: "",
  nit: "",
  email: "",
  phone: "",
  city: "",
};

function toForm(organization: MiEmpresa): EmpresaForm {
  return {
    name: organization.name ?? "",
    nit: organization.nit ?? "",
    email: organization.email ?? "",
    phone: organization.phone ?? "",
    city: organization.city ?? "",
  };
}

export function EmpresaSection() {
  const [form, setForm] = useState<EmpresaForm>(EMPTY);
  const [saved, setSaved] = useState<EmpresaForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const organization = await apiGetMiEmpresa();
        if (!cancelled) {
          const next = toForm(organization);
          setForm(next);
          setSaved(next);
        }
      } catch (caught) {
        if (
          !cancelled &&
          !(caught instanceof ApiError && caught.status === 401)
        ) {
          setError("No se pudieron cargar los datos de la empresa.");
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

  const dirty =
    saved !== null &&
    (Object.keys(EMPTY) as (keyof EmpresaForm)[]).some(
      (key) => form[key].trim() !== saved[key].trim(),
    );

  function change(field: keyof EmpresaForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Solo se envían los campos editables; el backend ignora el resto.
      const updated = await apiUpdateMiEmpresa({
        name: form.name.trim(),
        nit: form.nit.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
      });
      const next = toForm(updated);
      setForm(next);
      setSaved(next);
      setNotice("Cambios guardados.");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "No se pudieron guardar los datos de la empresa.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="empresa-title" className="space-y-4">
      <div>
        <h2
          id="empresa-title"
          className="text-base font-semibold tracking-tight"
        >
          Empresa
        </h2>
        <p className="text-sm text-muted-foreground">
          Datos que aparecen en las comunicaciones con tus clientes.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="empresa-name">Nombre</Label>
            <Input
              id="empresa-name"
              value={form.name}
              maxLength={120}
              onChange={(event) => change("name", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="empresa-nit">NIT</Label>
            <Input
              id="empresa-nit"
              value={form.nit}
              maxLength={32}
              onChange={(event) => change("nit", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="empresa-phone">Teléfono</Label>
            <Input
              id="empresa-phone"
              value={form.phone}
              maxLength={32}
              placeholder="+576001234567"
              onChange={(event) => change("phone", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="empresa-email">Correo</Label>
            <Input
              id="empresa-email"
              type="email"
              value={form.email}
              maxLength={180}
              placeholder="contacto@empresa.com"
              onChange={(event) => change("email", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="empresa-city">Ciudad</Label>
            <Input
              id="empresa-city"
              value={form.city}
              maxLength={120}
              onChange={(event) => change("city", event.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving || loading || !dirty}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-muted-foreground">
            Hay cambios sin guardar
          </span>
        )}
      </div>
    </section>
  );
}
