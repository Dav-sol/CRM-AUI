"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Megaphone, Calendar, Shield, AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { ApiError, apiCreateCampaign, apiListProducts, apiListFollowUpSequences } from "@/lib/api";
import type { ProductItem, FollowUpSequenceItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { campaignSchema, type CampaignFormValues } from "@/lib/validators";

type CreateCampaignSheetProps = {
  onCreated?: () => void;
  autoOpenPreset?: string | null;
  onAutoClose?: () => void;
};

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const EMPTY_FORM: CampaignFormValues = {
  name: "",
  description: "",
  type: "AUTOMATIC",
  followUpSequenceId: "",
  template: "",
  templateD3: "",
  templateD180: "",
  templateD365: "",
  startAt: "",
  segment: undefined,
};

const WARRANTY_STAGES = [
  { key: "template", label: "Día 0", placeholder: "Confirmación de garantía digital, datos de instalación, recomendaciones de cuidado…", icon: Shield },
  { key: "templateD3", label: "Mitad de garantía", placeholder: "Recordatorio preventivo, invitación a revisión gratuita de alternador y voltaje…", icon: RotateCcw },
  { key: "templateD180", label: "Día -60 (Pre-vencimiento)", placeholder: "Aviso de proximidad del vencimiento, diagnóstico gratuito…", icon: AlertTriangle },
  { key: "templateD365", label: "Día -30 (Renovación)", placeholder: "Oferta de renovación, Plan Retorno, descuento + instalación/domicilio…", icon: Calendar },
] as const;

const PRESETS = [
  {
    key: "bienvenida",
    label: "Bienvenida",
    description: "Da la bienvenida y activa la garantía.",
    values: {
      name: "Bienvenida a nuevos clientes",
      type: "AUTOMATIC" as const,
      template:
        "¡Hola {customerName}! Gracias por confiar en {organizationName}. Tu batería {productName} ya tiene tu garantía activa. Cuidala revisando el voltaje cada 3 meses.",
    },
  },
  {
    key: "garantia",
    label: "Recordatorio de garantía",
    description: "Avisa que la garantía está por vencer.",
    values: {
      name: "Recordatorio de garantía",
      type: "REPURCHASE" as const,
      template:
        "Hola {customerName}, tu batería {productName} está por vencer su garantía. Te invitamos a una revisión gratuita en {organizationName}.",
    },
  },
  {
    key: "reactivacion",
    label: "Reactivación",
    description: "Trae de vuelta a clientes inactivos.",
    values: {
      name: "Reactivación de clientes",
      type: "REPURCHASE" as const,
      template:
        "Hola {customerName}, en {organizationName} tenemos una oferta especial para renovar tu {productName}. ¡Te esperamos!",
    },
  },
] as const;

export function CreateCampaignSheet({
  onCreated,
  autoOpenPreset,
  onAutoClose,
}: CreateCampaignSheetProps) {
  const preset = autoOpenPreset
    ? PRESETS.find((p) => p.key === autoOpenPreset)
    : undefined;
  const [open, setOpen] = useState(() => Boolean(autoOpenPreset));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [sequences, setSequences] = useState<FollowUpSequenceItem[] | null>(null);

  const presetDefaults: CampaignFormValues = preset
    ? {
        ...EMPTY_FORM,
        name: preset.values.name,
        type: preset.values.type,
        template: preset.values.template,
      }
    : EMPTY_FORM;

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    mode: "onTouched",
    defaultValues: presetDefaults,
  });

  const followUpSequenceId = watch("followUpSequenceId");
  const hasSequence = Boolean(followUpSequenceId);

  const segment = useWatch({ control, name: "segment" });
  const hasSegmentCriterion = Boolean(
    segment?.city?.trim() ||
      segment?.productId ||
      segment?.purchaseFrom ||
      segment?.purchaseTo ||
      segment?.customerStatus ||
      segment?.warrantyExpiresFrom ||
      segment?.warrantyExpiresTo ||
      segment?.warrantyMonths,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const [productsData, sequencesData] = await Promise.all([
          apiListProducts({ page: 1, limit: 100 }),
          apiListFollowUpSequences({ page: 1, limit: 100 }),
        ]);
        if (!cancelled) {
          setProducts(productsData.data);
          setSequences(sequencesData.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setProducts([]);
        setSequences([]);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSubmit(values: CampaignFormValues) {
    setSubmitError(null);
    const segment =
      values.segment && hasSegmentCriterion
        ? {
            ...(values.segment.city?.trim() ? { city: values.segment.city.trim() } : {}),
            ...(values.segment.productId ? { productId: values.segment.productId } : {}),
            ...(values.segment.purchaseFrom ? { purchaseFrom: values.segment.purchaseFrom } : {}),
            ...(values.segment.purchaseTo ? { purchaseTo: values.segment.purchaseTo } : {}),
            ...(values.segment.customerStatus
              ? { customerStatus: values.segment.customerStatus }
              : {}),
            ...(values.segment.warrantyExpiresFrom
              ? { warrantyExpiresFrom: values.segment.warrantyExpiresFrom }
              : {}),
            ...(values.segment.warrantyExpiresTo
              ? { warrantyExpiresTo: values.segment.warrantyExpiresTo }
              : {}),
            ...(values.segment.warrantyMonths
              ? { warrantyMonths: values.segment.warrantyMonths }
              : {}),
          }
        : undefined;
    try {
      await apiCreateCampaign({
        name: values.name,
        description: values.description || undefined,
        type: values.type,
        followUpSequenceId: values.followUpSequenceId || undefined,
        template: values.template,
        startAt: values.startAt ? new Date(values.startAt).toISOString() : undefined,
        segment,
      });
      toast.success("Campaña creada como borrador");
      setOpen(false);
      reset(EMPTY_FORM);
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo crear la campaña");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          onAutoClose?.();
        }
      }}
    >
      <SheetTrigger
        render={<Button size="sm" />}
        onClick={() => {
          setSubmitError(null);
          reset(EMPTY_FORM);
        }}
      >
        <Megaphone />
        Nueva campaña
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Nueva campaña</SheetTitle>
          <SheetDescription>
            La campaña se crea como borrador. Definí el segmento y los mensajes por etapa; activala
            cuando esté lista.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-4 overflow-y-auto p-4"
          noValidate
        >
          {submitError && (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {submitError}
            </p>
          )}

          <div className="space-y-2">
            <Label>Empezá con una plantilla</Label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setValue("name", preset.values.name);
                    setValue("type", preset.values.type);
                    setValue("template", preset.values.template);
                  }}
                  className="group rounded-lg border border-border/60 p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <p className="text-xs font-semibold group-hover:text-primary">
                    {preset.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-name">Nombre</Label>
            <Input
              id="campaign-name"
              placeholder="Campaña de garantía - Baterías MAC"
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
            <Label htmlFor="campaign-description">Descripción</Label>
            <Textarea
              id="campaign-description"
              placeholder="Seguimiento de garantía para baterías vendidas (12/15/18/24 meses)"
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

          <details className="space-y-3 rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
              Opciones avanzadas
            </summary>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="campaign-type">Tipo</Label>
              <select
                id="campaign-type"
                className={cn(selectClass, "appearance-none")}
                {...register("type")}
              >
                <option value="AUTOMATIC">Automática</option>
                <option value="MANUAL">Manual</option>
                <option value="REPURCHASE">Recompra</option>
                <option value="SPECIAL">Especial</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-start">Fecha de inicio</Label>
              <Input
                id="campaign-start"
                type="datetime-local"
                aria-invalid={!!errors.startAt}
                {...register("startAt")}
              />
              {errors.startAt && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.startAt.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-sequence">Secuencia de seguimiento</Label>
            <select
              id="campaign-sequence"
              className={cn(selectClass, "appearance-none")}
              {...register("followUpSequenceId")}
            >
              <option value="">Sin secuencia (usar mensaje principal)</option>
              {sequences?.map((sequence) => (
                <option key={sequence.uuid} value={sequence.uuid}>
                  {sequence.name} ({sequence.warrantyMonths} meses, {sequence.stageCount} etapas)
                </option>
              ))}
            </select>
            {errors.followUpSequenceId && (
              <p className="text-xs text-destructive" role="alert">
                {errors.followUpSequenceId.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Al seleccionar una secuencia, se usarán sus etapas y plantillas. El mensaje principal
              se usa como fallback.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-template">Mensaje principal (fallback)</Label>
            <Textarea
              id="campaign-template"
              placeholder="Hola {customerName}, tu batería {productName} tiene garantía vigente…"
              rows={4}
              maxLength={4096}
              className="resize-none text-sm"
              aria-invalid={!!errors.template}
              {...register("template")}
            />
            {errors.template && (
              <p className="text-xs text-destructive" role="alert">
                {errors.template.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Podés usar {"{customerName}"}, {"{productName}"}, {"{organizationName}"},{" "}
              {"{warrantyExpiresAt}"} como variables.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Mensajes por etapa de garantía (opcional)</p>
            <p className="text-xs text-muted-foreground">
              Si una etapa queda vacía, se usa el mensaje principal. Las etapas se disparan
              respecto a la fecha de vencimiento de la garantía.
            </p>
            {!hasSequence && (
              <div className="space-y-2">
                {WARRANTY_STAGES.map((stage) => (
                  <div key={stage.key} className="space-y-1">
                    <Label htmlFor={`campaign-${stage.key}`}>
                      <stage.icon className="size-3 inline-block mr-1" />
                      {stage.label}
                    </Label>
                    <Textarea
                      id={`campaign-${stage.key}`}
                      placeholder={stage.placeholder}
                      rows={2}
                      maxLength={4096}
                      className="resize-none text-sm"
                      {...register(stage.key)}
                    />
                  </div>
                ))}
              </div>
            )}
            {hasSequence && (
              <p className="text-xs text-muted-foreground">
                Las etapas y plantillas se tomarán de la secuencia seleccionada.
              </p>
            )}
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border/60 p-3">
            <legend className="px-1 text-sm font-medium">Segmento (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="segment-city">Ciudad</Label>
                <Input
                  id="segment-city"
                  placeholder="Quito"
                  maxLength={200}
                  {...register("segment.city")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment-product">Producto</Label>
                <select
                  id="segment-product"
                  className={cn(selectClass, "appearance-none")}
                  {...register("segment.productId")}
                >
                  <option value="">Todos</option>
                  {products?.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="segment-from">Compra desde</Label>
                <Input id="segment-from" type="date" {...register("segment.purchaseFrom")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment-to">Compra hasta</Label>
                <Input id="segment-to" type="date" {...register("segment.purchaseTo")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="segment-warranty-from">Garantía vence desde</Label>
                <Input
                  id="segment-warranty-from"
                  type="date"
                  {...register("segment.warrantyExpiresFrom")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment-warranty-to">Garantía vence hasta</Label>
                <Input
                  id="segment-warranty-to"
                  type="date"
                  {...register("segment.warrantyExpiresTo")}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="segment-warranty-months">Duración garantía (meses)</Label>
                <select
                  id="segment-warranty-months"
                  className={cn(selectClass, "appearance-none")}
                  {...register("segment.warrantyMonths", { valueAsNumber: true })}
                >
                  <option value="">Todas</option>
                  <option value={12}>12 meses</option>
                  <option value={15}>15 meses</option>
                  <option value={18}>18 meses</option>
                  <option value={24}>24 meses</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment-status">Estado del cliente</Label>
                <select
                  id="segment-status"
                  className={cn(selectClass, "appearance-none")}
                  {...register("segment.customerStatus")}
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                  <option value="BLOCKED">Bloqueado</option>
                </select>
              </div>
            </div>
            {errors.segment && (
              <p className="text-xs text-destructive" role="alert">
                {errors.segment.message}
              </p>
            )}
          </fieldset>
          </details>
        </form>

        <SheetFooter className="border-t border-border/60">
          <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Creando…" : "Crear campaña"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}