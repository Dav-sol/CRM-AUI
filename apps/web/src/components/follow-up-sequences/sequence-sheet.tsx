"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Control,
  FieldErrors,
  useForm,
  useFieldArray,
  UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  apiCreateFollowUpSequence,
  apiGetFollowUpSequence,
  apiUpdateFollowUpSequence,
} from "@/lib/api";
import type { CreateFollowUpSequenceBodyWarrantyMonths } from "@automatize-it/sdk/model/createFollowUpSequenceBodyWarrantyMonths";
import type { UpdateFollowUpSequenceBodyWarrantyMonths } from "@automatize-it/sdk/model/updateFollowUpSequenceBodyWarrantyMonths";
import type { FollowUpSequenceDetail } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { followUpSequenceSchema, FollowUpSequenceFormValues } from "@/lib/validators";

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const WARRANTY_OPTIONS = [
  { value: 12, label: "12 meses" },
  { value: 15, label: "15 meses" },
  { value: 18, label: "18 meses" },
  { value: 24, label: "24 meses" },
] as const;

const EMPTY_FORM: FollowUpSequenceFormValues = {
  name: "",
  description: "",
  warrantyMonths: 12,
  stages: [{ name: "", offsetDays: -30, template: "" }],
};

function formValuesFromDetail(detail: FollowUpSequenceDetail): FollowUpSequenceFormValues {
  return {
    name: detail.name,
    description: detail.description ?? "",
    warrantyMonths: (detail.warrantyMonths === 12 ||
      detail.warrantyMonths === 15 ||
      detail.warrantyMonths === 18 ||
      detail.warrantyMonths === 24
      ? detail.warrantyMonths
      : 12) as FollowUpSequenceFormValues["warrantyMonths"],
    stages:
      detail.stages.length > 0
        ? detail.stages.map((stage) => ({
            name: stage.name,
            offsetDays: stage.offsetDays,
            template: stage.template,
          }))
        : EMPTY_FORM.stages,
  };
}

function SequenceFormFields({
  register,
  errors,
  control,
}: {
  register: UseFormRegister<FollowUpSequenceFormValues>;
  errors: FieldErrors<FollowUpSequenceFormValues>;
  control: Control<FollowUpSequenceFormValues>;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "stages",
  });

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sequence-name">Nombre</Label>
        <Input
          id="sequence-name"
          placeholder="Seguimiento garantía 12 meses"
          maxLength={120}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sequence-description">Descripción</Label>
        <Textarea
          id="sequence-description"
          placeholder="Secuencia para baterías con 12 meses de garantía"
          rows={2}
          maxLength={1000}
          className="resize-none text-sm"
          aria-invalid={!!errors.description}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-destructive" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sequence-warranty">Duración de garantía</Label>
        <select
          id="sequence-warranty"
          className={cn(selectClass, "appearance-none")}
          {...register("warrantyMonths", { valueAsNumber: true })}
        >
          {WARRANTY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.warrantyMonths && (
          <p className="text-xs text-destructive" role="alert">
            {errors.warrantyMonths.message}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Etapas</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: "", offsetDays: -30, template: "" })}
            disabled={fields.length >= 10}
          >
            <Plus className="size-3.5 mr-1" />
            Agregar etapa
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          El offset es en días respecto al vencimiento de la garantía.
          D-30 = 30 días antes del vencimiento, D0 = día del vencimiento.
        </p>
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">Agregá al menos una etapa.</p>
        )}
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="space-y-2 p-3 rounded-lg border border-border/60 bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <Label className="font-medium">Etapa {index + 1}</Label>
                <div className="flex items-center gap-1">
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => move(index, index - 1)}
                      aria-label={`Mover etapa ${index + 1} arriba`}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                  )}
                  {index < fields.length - 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => move(index, index + 1)}
                      aria-label={`Mover etapa ${index + 1} abajo`}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:bg-destructive/10"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    aria-label={`Eliminar etapa ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`stage-name-${index}`}>Nombre</Label>
                  <Input
                    id={`stage-name-${index}`}
                    placeholder="Recordatorio preventivo"
                    maxLength={120}
                    aria-invalid={!!errors.stages?.[index]?.name}
                    {...register(`stages.${index}.name`)}
                  />
                  {errors.stages?.[index]?.name && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.stages[index].name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`stage-offset-${index}`}>Offset (días)</Label>
                  <Input
                    id={`stage-offset-${index}`}
                    type="number"
                    step={1}
                    min={-365}
                    max={365}
                    placeholder="-30"
                    aria-invalid={!!errors.stages?.[index]?.offsetDays}
                    {...register(`stages.${index}.offsetDays`, { valueAsNumber: true })}
                  />
                  {errors.stages?.[index]?.offsetDays && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.stages[index].offsetDays.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`stage-template-${index}`}>Mensaje</Label>
                <Textarea
                  id={`stage-template-${index}`}
                  placeholder="Hola {customerName}, tu garantía vence pronto…"
                  rows={3}
                  maxLength={4096}
                  className="resize-none text-sm"
                  aria-invalid={!!errors.stages?.[index]?.template}
                  {...register(`stages.${index}.template`)}
                />
                {errors.stages?.[index]?.template && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.stages[index].template.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Variables: {"{"}customerName{"}"}, {"{"}productName{"}"},{" "}
                  {"{"}organizationName{"}"}, {"{"}warrantyExpiresAt{"}"}
                </p>
              </div>
            </div>
          ))}
        </div>
        {errors.stages && (
          <p className="text-xs text-destructive" role="alert">
            {errors.stages.message}
          </p>
        )}
      </div>
    </>
  );
}

function SubmitError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

export function CreateSequenceSheet({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpSequenceFormValues>({
    resolver: zodResolver(followUpSequenceSchema),
    mode: "onTouched",
    defaultValues: EMPTY_FORM,
  });

  async function onSubmit(values: FollowUpSequenceFormValues) {
    setSubmitError(null);
    try {
      await apiCreateFollowUpSequence({
        name: values.name,
        description: values.description || undefined,
        warrantyMonths:
          values.warrantyMonths as CreateFollowUpSequenceBodyWarrantyMonths,
        stages: values.stages.map((stage) => ({
          name: stage.name.trim(),
          offsetDays: stage.offsetDays,
          template: stage.template.trim(),
        })),
      });
      toast.success("Secuencia creada correctamente");
      setOpen(false);
      reset(EMPTY_FORM);
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo crear la secuencia");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button size="sm" />}
        onClick={() => {
          setSubmitError(null);
          reset(EMPTY_FORM);
        }}
      >
        <Plus />
        Nueva secuencia
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Nueva secuencia</SheetTitle>
          <SheetDescription>
            La secuencia se crea con sus etapas. Define la duración de garantía y las etapas
            con sus offsets respecto a la fecha de vencimiento.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-4 overflow-y-auto p-4"
          noValidate
        >
          <SubmitError message={submitError} />
          <SequenceFormFields register={register} errors={errors} control={control} />
        </form>

        <SheetFooter className="border-t border-border/60">
          <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Creando…" : "Crear secuencia"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type EditSequenceSheetProps = {
  uuid: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function EditSequenceSheet({ uuid, onClose, onSaved }: EditSequenceSheetProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedUuid, setLoadedUuid] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpSequenceFormValues>({
    resolver: zodResolver(followUpSequenceSchema),
    mode: "onTouched",
    defaultValues: EMPTY_FORM,
  });

  useEffect(() => {
    if (uuid === null) {
      return;
    }
    let cancelled = false;

    void apiGetFollowUpSequence(uuid)
      .then((detail) => {
        if (!cancelled) {
          reset(formValuesFromDetail(detail));
          setLoadedUuid(uuid);
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          return;
        }
        setLoadError("No se pudo cargar la secuencia.");
      });

    return () => {
      cancelled = true;
    };
  }, [uuid, reset]);

  async function onSubmit(values: FollowUpSequenceFormValues) {
    if (uuid === null) {
      return;
    }
    setSubmitError(null);
    try {
      await apiUpdateFollowUpSequence(uuid, {
        name: values.name,
        description: values.description || undefined,
        warrantyMonths:
          values.warrantyMonths as UpdateFollowUpSequenceBodyWarrantyMonths,
        stages: values.stages.map((stage) => ({
          name: stage.name.trim(),
          offsetDays: stage.offsetDays,
          template: stage.template.trim(),
        })),
      });
      toast.success("Secuencia actualizada correctamente");
      onClose();
      onSaved?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo actualizar la secuencia");
    }
  }

  return (
    <Sheet open={uuid !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Editar secuencia</SheetTitle>
          <SheetDescription>
            Modificá los datos y las etapas. Los cambios se guardan como reemplazo completo de
            etapas.
          </SheetDescription>
        </SheetHeader>

        {loadError ? (
          <div className="flex-1 p-4">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        ) : loadedUuid !== uuid ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Cargando…
            </p>
          </div>
        ) : (
          <>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex-1 space-y-4 overflow-y-auto p-4"
              noValidate
            >
              <SubmitError message={submitError} />
              <SequenceFormFields register={register} errors={errors} control={control} />
            </form>

            <SheetFooter className="border-t border-border/60">
              <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Guardando…" : "Guardar cambios"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}