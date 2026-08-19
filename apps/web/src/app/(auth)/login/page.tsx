"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { loginSchema, type LoginFormValues } from "@/lib/validators";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
  });

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("No se pudo conectar con el servidor. Inténtalo nuevamente.");
      }
      toast.error("No se pudo iniciar sesión");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            A
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">Automatize It</h1>
            <p className="text-sm text-muted-foreground">
              Seguimiento post-venta y fidelización
            </p>
          </div>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Iniciá sesión</CardTitle>
            <CardDescription>Ingresá tus credenciales para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {submitError && (
                <Alert variant="destructive">
                  <AlertTitle>Error de autenticación</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tucorreo@empresa.com"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? "Ingresando…" : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}