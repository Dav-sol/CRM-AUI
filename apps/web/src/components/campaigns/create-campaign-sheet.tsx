"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Megaphone } from "lucide-react";
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
import { ApiError, apiCreateCampaign, apiListProducts } from "@/lib/api";
import type { ProductItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { campaignSchema, type CampaignFormValues } from "@/lib/validators";

type CreateCampaignSheetProps = {
  onCreated?: () => void;
};

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const EMPTY_FORM: CampaignFormValues = {
  name: "",
  description: "",
  type: "AUTOMATIC",
  template: "",
  startAt: "",
  segment: undefined,
};

export function CreateCampaignSheet({ onCreated }: CreateCampaignSheetProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductItem[] | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    mode: "onTouched",
    defaultValues: EMPTY_FORM,
  });

  const segment = useWatch({ control, name: "segment" });
  const hasSegmentCriterion = Boolean(
    segment?.city?.trim() ||
      segment?.productId ||
      segment?.purchaseFrom ||
      segment?.purchaseTo ||
      segment?.customerStatus,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const data = await apiListProducts({ page: 1, limit: 100 });
        if (!cancelled) {
          setProducts(data.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setProducts([]);
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
          }
        : undefined;
    try {
      await apiCreateCampaign({
        name: values.name,
        description: values.description || undefined,
        type: values.type,
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
    <Sheet open={open} onOpenChange={setOpen}>
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
            La campaña se crea como borrador. Definí el segmento y el mensaje; activala cuando
            esté lista.
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
            <Label htmlFor="campaign-name">Nombre</Label>
            <Input
              id="campaign-name"
              placeholder="Campaña de recompra"
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
              placeholder="Objetivo de la campaña (opcional)"
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

          <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="campaign-template">Mensaje</Label>
            <Textarea
              id="campaign-template"
              placeholder="Hola {customerName}, te esperamos con tu {productName}…"
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
              Podés usar {"{customerName}"}, {"{productName}"} y {"{organizationName}"} como
              variables.
            </p>
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
            {errors.segment && (
              <p className="text-xs text-destructive" role="alert">
                {errors.segment.message}
              </p>
            )}
          </fieldset>
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