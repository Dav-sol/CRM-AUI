"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Package } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { ApiError, apiCreateProduct, apiUpdateProduct } from "@/lib/api";
import type { ProductItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { productSchema, type ProductFormValues } from "@/lib/validators";

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const EMPTY_FORM: ProductFormValues = {
  code: "",
  name: "",
  category: "",
  status: "ACTIVE",
};

type ProductFormSheetProps = {
  product?: ProductItem | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: () => void;
};

export function ProductFormSheet({
  product,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: ProductFormSheetProps) {
  const isEdit = Boolean(product);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formKey = `${open}-${product?.uuid ?? "new"}`;
  const defaultValues: ProductFormValues = isEdit && product
    ? {
        code: product.code,
        name: product.name,
        category: product.category ?? "",
        status: product.status,
      }
    : EMPTY_FORM;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    mode: "onTouched",
    defaultValues,
  });

  async function onSubmit(values: ProductFormValues) {
    setSubmitError(null);
    const body = {
      name: values.name,
      category: values.category || undefined,
      status: values.status,
    };
    try {
      if (isEdit && product) {
        await apiUpdateProduct(product.id, body);
        toast.success("Producto actualizado");
      } else {
        await apiCreateProduct({ code: values.code, ...body });
        toast.success("Producto creado");
      }
      setOpen(false);
      onSaved?.();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setSubmitError("Ya existe un producto con ese código.");
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error(isEdit ? "No se pudo actualizar el producto" : "No se pudo crear el producto");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <SheetTrigger
          render={<Button size="sm" />}
        >
          <Package />
          Nuevo producto
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <div key={formKey} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{isEdit ? "Editar producto" : "Nuevo producto"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "El código no se puede modificar después de la creación."
                : "El código identifica al producto en el catálogo y no se puede modificar después."}
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
              <Label htmlFor="product-code">Código</Label>
              <Input
                id="product-code"
                placeholder="P-100"
                maxLength={50}
                disabled={isEdit}
                aria-invalid={!!errors.code}
                {...register("code")}
              />
              {errors.code && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.code.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-name">Nombre</Label>
              <Input
                id="product-name"
                placeholder="Batería X"
                maxLength={200}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="product-category">Categoría</Label>
                <Input
                  id="product-category"
                  placeholder="Baterías"
                  maxLength={100}
                  aria-invalid={!!errors.category}
                  {...register("category")}
                />
                {errors.category && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.category.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-status">Estado</Label>
                <select
                  id="product-status"
                  className={cn(selectClass, "appearance-none")}
                  {...register("status")}
                >
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>
            </div>
          </form>

          <SheetFooter className="border-t border-border/60">
            <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
              {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {isSubmitting
                ? isEdit
                  ? "Guardando…"
                  : "Creando…"
                : isEdit
                  ? "Guardar cambios"
                  : "Crear producto"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}