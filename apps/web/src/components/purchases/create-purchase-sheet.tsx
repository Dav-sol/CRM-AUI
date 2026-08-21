"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Calendar, Shield } from "lucide-react";
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
import { ApiError, apiCreatePurchase, apiListCustomers, apiListProducts } from "@/lib/api";
import type { CustomerItem, ProductItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { purchaseSchema, type PurchaseFormInput, type PurchaseFormValues } from "@/lib/validators";
import { formatDate } from "@/lib/format";

type CreatePurchaseSheetProps = {
  onCreated?: () => void;
};

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

export function CreatePurchaseSheet({ onCreated }: CreatePurchaseSheetProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[] | null>(null);
  const [products, setProducts] = useState<ProductItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormInput, unknown, PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    mode: "onTouched",
    defaultValues: {
      status: "COMPLETED",
      purchaseDate: new Date().toISOString().slice(0, 16),
      value: "",
    },
  });

  const selectedProductId = useWatch({ control, name: "productId" });
  const selectedPurchaseDate = useWatch({ control, name: "purchaseDate" });

  const selectedProduct = products?.find((p) => p.id === selectedProductId);
  const warrantyMonths = (selectedProduct as unknown as { warrantyMonths?: number })?.warrantyMonths;
  const warrantyExpiresAt = warrantyMonths && selectedPurchaseDate
    ? (() => {
        const d = new Date(selectedPurchaseDate);
        d.setMonth(d.getMonth() + warrantyMonths);
        return d;
      })()
    : null;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    async function load() {
      setLoadError(null);
      try {
        const [customerData, productData] = await Promise.all([
          apiListCustomers({ page: 1, limit: 100 }),
          apiListProducts({ page: 1, limit: 100 }),
        ]);
        if (cancelled) {
          return;
        }
        setCustomers(customerData.data);
        setProducts(productData.data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        setLoadError("No se pudieron cargar clientes y productos.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSubmit(values: PurchaseFormValues) {
    setSubmitError(null);
    try {
      await apiCreatePurchase({
        customerId: values.customerId,
        productId: values.productId,
        invoiceNumber: values.invoiceNumber,
        purchaseDate: new Date(values.purchaseDate).toISOString(),
        quantity: values.quantity,
        value: values.value.replace(",", "."),
        status: values.status,
        warrantyMonths: values.warrantyMonths,
      });
      toast.success("Compra registrada correctamente");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo registrar la compra");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button size="sm" />}
        onClick={() => {
          setSubmitError(null);
          reset({
            status: "COMPLETED",
            purchaseDate: new Date().toISOString().slice(0, 16),
            value: "",
          });
        }}
      >
        <Plus />
        Nueva compra
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Nueva compra</SheetTitle>
          <SheetDescription>
            Registrá una compra de un cliente. Cliente, producto y factura quedan fijos al crear.
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
          {loadError && (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {loadError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="purchase-customer">Cliente</Label>
            <select
              id="purchase-customer"
              className={cn(selectClass, "appearance-none")}
              aria-invalid={!!errors.customerId}
              {...register("customerId")}
            >
              <option value="">Seleccionar cliente…</option>
              {customers?.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.codcli})
                </option>
              ))}
            </select>
            {errors.customerId && (
              <p className="text-xs text-destructive" role="alert">
                {errors.customerId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-product">Producto</Label>
            <select
              id="purchase-product"
              className={cn(selectClass, "appearance-none")}
              aria-invalid={!!errors.productId}
              {...register("productId")}
            >
              <option value="">Seleccionar producto…</option>
              {products?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.code})
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="text-xs text-destructive" role="alert">
                {errors.productId.message}
              </p>
            )}
            {selectedProduct && warrantyMonths && (
              <div className="mt-2 rounded-lg bg-muted/50 p-3 border border-border/60">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Shield className="size-4" />
                  <span>Garantía del producto</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Duración: </span>
                    <span className="font-medium">{warrantyMonths} meses</span>
                  </div>
                  {warrantyExpiresAt && (
                    <div>
                      <span className="text-muted-foreground">Vence: </span>
                      <span className="font-medium">
                        <Calendar className="size-3 inline-block align-middle mr-1" />
                        {formatDate(warrantyExpiresAt.toISOString())}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="purchase-warranty-months">Duración garantía (meses) <span className="text-xs text-muted-foreground">(opcional, sobrescribe la del producto)</span></Label>
              <Input
                id="purchase-warranty-months"
                type="number"
                min={1}
                max={24}
                step={1}
                placeholder={warrantyMonths ? `${warrantyMonths} (producto)` : "Usa la del producto"}
                aria-invalid={!!errors.warrantyMonths}
                {...register("warrantyMonths", { valueAsNumber: true })}
              />
              {errors.warrantyMonths && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.warrantyMonths.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-invoice">Número de factura</Label>
            <Input
              id="purchase-invoice"
              placeholder="INV-0001"
              maxLength={50}
              aria-invalid={!!errors.invoiceNumber}
              {...register("invoiceNumber")}
            />
            {errors.invoiceNumber && (
              <p className="text-xs text-destructive" role="alert">
                {errors.invoiceNumber.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="purchase-date">Fecha de compra</Label>
              <Input
                id="purchase-date"
                type="datetime-local"
                aria-invalid={!!errors.purchaseDate}
                {...register("purchaseDate")}
              />
              {errors.purchaseDate && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.purchaseDate.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-quantity">Cantidad</Label>
              <Input
                id="purchase-quantity"
                type="number"
                min={1}
                step={1}
                placeholder="1"
                aria-invalid={!!errors.quantity}
                {...register("quantity")}
              />
              {errors.quantity && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.quantity.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="purchase-value">Valor total</Label>
              <Input
                id="purchase-value"
                inputMode="decimal"
                placeholder="125.50"
                aria-invalid={!!errors.value}
                {...register("value")}
              />
              {errors.value && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.value.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-status">Estado</Label>
              <select
                id="purchase-status"
                className={cn(selectClass, "appearance-none")}
                {...register("status")}
              >
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Cancelada</option>
                <option value="REFUNDED">Reembolsada</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            El valor usa punto decimal (ej: 125.50). El número de factura debe ser único por
            cliente, producto y fecha.
          </p>
        </form>

        <SheetFooter className="border-t border-border/60">
          <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Registrando…" : "Registrar compra"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}