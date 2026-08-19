"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
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
import { ApiError, apiCreateCustomer } from "@/lib/api";
import { customerSchema, type CustomerFormValues } from "@/lib/validators";

type CreateCustomerSheetProps = {
  onCreated?: () => void;
};

export function CreateCustomerSheet({ onCreated }: CreateCustomerSheetProps) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    mode: "onTouched",
  });

  async function onSubmit(values: CustomerFormValues) {
    setSubmitError(null);
    const body = {
      codcli: values.codcli,
      name: values.name,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.address ? { address: values.address } : {}),
      ...(values.city ? { city: values.city } : {}),
    };
    try {
      await apiCreateCustomer(body);
      toast.success("Cliente creado correctamente");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo crear el cliente");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button size="sm" />}
        onClick={() => {
          setSubmitError(null);
          reset();
        }}
      >
        <UserPlus />
        Nuevo cliente
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Nuevo cliente</SheetTitle>
          <SheetDescription>
            Cargá los datos de contacto del cliente. El código es único e inmutable.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 space-y-4 overflow-y-auto p-4"
          noValidate
        >
          {submitError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="customer-codcli">Código de cliente</Label>
            <Input
              id="customer-codcli"
              placeholder="C-0001"
              maxLength={50}
              aria-invalid={!!errors.codcli}
              {...register("codcli")}
            />
            {errors.codcli && (
              <p className="text-xs text-destructive" role="alert">
                {errors.codcli.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-name">Nombre</Label>
            <Input
              id="customer-name"
              placeholder="Juan Pérez"
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

          <div className="space-y-2">
            <Label htmlFor="customer-phone">Teléfono</Label>
            <Input
              id="customer-phone"
              placeholder="0991234567"
              maxLength={30}
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-xs text-destructive" role="alert">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              placeholder="juan@example.com"
              maxLength={200}
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customer-address">Dirección</Label>
              <Input
                id="customer-address"
                placeholder="Av. Siempre Viva 123"
                maxLength={200}
                aria-invalid={!!errors.address}
                {...register("address")}
              />
              {errors.address && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.address.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-city">Ciudad</Label>
              <Input
                id="customer-city"
                placeholder="Quito"
                maxLength={200}
                aria-invalid={!!errors.city}
                {...register("city")}
              />
              {errors.city && (
                <p className="text-xs text-destructive" role="alert">
                  {errors.city.message}
                </p>
              )}
            </div>
          </div>
        </form>

        <SheetFooter className="border-t border-border/60">
          <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Creando…" : "Crear cliente"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}