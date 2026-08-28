"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FollowUpSequenceItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

type GeneralInfoValues = {
  name: string;
  description?: string;
  type: string;
  followUpSequenceId?: string;
  startAt?: string;
};

type GeneralInfoField =
  | "name"
  | "description"
  | "type"
  | "followUpSequenceId"
  | "startAt";

type GeneralInfoProps = {
  values: GeneralInfoValues;
  sequences: FollowUpSequenceItem[];
  disabledFields?: GeneralInfoField[];
  onChange: (field: GeneralInfoField, value: string) => void;
};

// Fase 1: datos generales de la campaña dentro del editor full-page.
export function GeneralInfo({
  values,
  sequences,
  disabledFields = [],
  onChange,
}: GeneralInfoProps) {
  const isDisabled = (field: GeneralInfoField) => disabledFields.includes(field);
  return (
    <fieldset className="space-y-4 rounded-lg border border-border/60 p-4">
      <legend className="px-1 text-sm font-medium">Datos generales</legend>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="camp-name">Nombre *</Label>
          <Input
            id="camp-name"
            placeholder="Ej: Recordatorio de garantía Q3"
            maxLength={120}
            value={values.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="camp-type">Tipo</Label>
          <select
            id="camp-type"
            className={cn(selectClass, "appearance-none")}
            value={values.type}
            onChange={(e) => onChange("type", e.target.value)}
            disabled={isDisabled("type")}
          >
            <option value="AUTOMATIC">Automática</option>
            <option value="MANUAL">Manual</option>
            <option value="REPURCHASE">Recompra</option>
            <option value="SPECIAL">Especial</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="camp-description">Descripción</Label>
        <Textarea
          id="camp-description"
          placeholder="Objetivo de la campaña…"
          rows={2}
          maxLength={1000}
          className="resize-none text-sm"
          value={values.description ?? ""}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="camp-start">Fecha de inicio</Label>
          <Input
            id="camp-start"
            type="datetime-local"
            value={values.startAt ?? ""}
            onChange={(e) => onChange("startAt", e.target.value)}
            disabled={isDisabled("startAt")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="camp-sequence">Secuencia de seguimiento</Label>
          <select
            id="camp-sequence"
            className={cn(selectClass, "appearance-none")}
            value={values.followUpSequenceId ?? ""}
            onChange={(e) => onChange("followUpSequenceId", e.target.value)}
            disabled={isDisabled("followUpSequenceId")}
          >
            <option value="">Sin secuencia (timeline propio)</option>
            {sequences.map((sequence) => (
              <option key={sequence.uuid} value={sequence.uuid}>
                {sequence.name} ({sequence.warrantyMonths} meses,{" "}
                {sequence.stageCount} etapas)
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Con secuencia, sus etapas se usan tal cual; sin secuencia defines tu
            propio timeline en la pestaña siguiente.
          </p>
        </div>
      </div>
    </fieldset>
  );
}
