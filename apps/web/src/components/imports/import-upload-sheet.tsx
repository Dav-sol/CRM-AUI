"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import { ApiError, apiCreateImportJob } from "@/lib/api";
import { cn } from "@/lib/utils";
import { IMPORT_TYPE_LABELS } from "@/lib/validators";

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const FORMAT_COLUMNS: Record<
  string,
  { required: string[]; optional?: string[]; note: string }
> = {
  CUSTOMERS: {
    required: ["codcli", "name"],
    optional: ["phone", "email", "address", "city"],
    note: "codcli = código de cliente · name = nombre. El resto son opcionales.",
  },
  PRODUCTS: {
    required: ["code", "name"],
    optional: ["category", "status"],
    note: "code = código de producto · name = nombre. Categoría recomendada.",
  },
  PURCHASES: {
    required: [
      "invoiceNumber",
      "codcli",
      "code",
      "purchaseDate",
      "quantity",
      "value",
    ],
    optional: ["installationDate"],
    note: "Compras: factura, código de cliente, código de producto, fecha, cantidad y valor.",
  },
};

const IMPORT_TYPES: { value: "CUSTOMERS" | "PRODUCTS" | "PURCHASES" }[] = [
  { value: "CUSTOMERS" },
  { value: "PRODUCTS" },
  { value: "PURCHASES" },
];

type ImportUploadSheetProps = {
  onSaved?: () => void;
};

export function ImportUploadSheet({ onSaved }: ImportUploadSheetProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"CUSTOMERS" | "PRODUCTS" | "PURCHASES">(
    "CUSTOMERS",
  );
  const [file, setFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Desmarcado por defecto. Solo tiene efecto en PURCHASES.
  const [usePurchaseDateAsInstallation, setUsePurchaseDateAsInstallation] =
    useState(false);
  // Confirmación previa a la importación. Es un paso intermedio: cancelar
  // devuelve al formulario sin subir nada.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const format = FORMAT_COLUMNS[type];

  /** El checkbox solo existe para compras. */
  const showInstallationOption = type === "PURCHASES";

  async function upload() {
    if (!file) {
      setSubmitError("Selecciona un archivo .xlsx, .xls o .csv.");
      return;
    }
    setSubmitting(true);
    try {
      await apiCreateImportJob({
        file,
        type,
        // El backend lo ignora si el tipo no es PURCHASES; aquí ya se garantiza
        // que solo se manda cuando la opción está visible.
        installationFromPurchaseDate: showInstallationOption
          ? usePurchaseDateAsInstallation
          : false,
      });
      toast.success("Importación programada");
      closeSheet();
      onSaved?.();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(
          "No se pudo conectar con el servidor. Inténtalo nuevamente.",
        );
      }
      toast.error("No se pudo programar la importación");
      setAwaitingConfirmation(false);
    } finally {
      setSubmitting(false);
    }
  }

  function closeSheet() {
    setOpen(false);
    setFile(null);
    setSubmitError(null);
    setAwaitingConfirmation(false);
    setUsePurchaseDateAsInstallation(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setSubmitError("Selecciona un archivo .xlsx, .xls o .csv.");
      return;
    }
    setSubmitError(null);

    // Con la opción marcada se pide confirmación antes de subir nada.
    if (showInstallationOption && usePurchaseDateAsInstallation) {
      setAwaitingConfirmation(true);
      return;
    }
    await upload();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" />}>
        <Upload />
        Importar archivo
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Importar archivo</SheetTitle>
            <SheetDescription>
              Sube un Excel o CSV con tus clientes, productos o compras. Los
              duplicados se actualizan automáticamente.
            </SheetDescription>
          </SheetHeader>

          {awaitingConfirmation ? (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-sm font-medium">
                Confirmar fecha de instalación
              </p>
              <p className="text-sm text-muted-foreground">
                Estás indicando que, para este archivo, la fecha de compra
                corresponde a la fecha de instalación. Esto se utilizará para
                crear los ciclos de seguimiento postventa.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => {
                    setAwaitingConfirmation(false);
                    setSubmitError(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void upload()}
                >
                  {submitting && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  {submitting ? "Subiendo…" : "Confirmar"}
                </Button>
              </div>
            </div>
          ) : (
            <form
              id="import-form"
              onSubmit={onSubmit}
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
                <Label htmlFor="import-type">Tipo de datos</Label>
                <select
                  id="import-type"
                  className={cn(selectClass, "appearance-none")}
                  value={type}
                  onChange={(event) => {
                    const next = event.target.value as typeof type;
                    setType(next);
                    setSubmitError(null);
                    // La opción solo aplica a compras: si se cambia de tipo, se
                    // desmarca para que no sobreviva marcada en otro flujo.
                    if (next !== "PURCHASES") {
                      setUsePurchaseDateAsInstallation(false);
                    }
                  }}
                >
                  {IMPORT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {IMPORT_TYPE_LABELS[option.value]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-file">Archivo</Label>
                <Input
                  ref={inputRef}
                  id="import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  Máximo 25 MB y 50.000 filas.
                </p>
              </div>

              {showInstallationOption && (
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <label
                    htmlFor="use-purchase-date-as-installation"
                    className="flex items-start gap-2 text-sm font-medium"
                  >
                    <input
                      id="use-purchase-date-as-installation"
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={usePurchaseDateAsInstallation}
                      onChange={(event) => {
                        setUsePurchaseDateAsInstallation(event.target.checked);
                        setSubmitError(null);
                      }}
                    />
                    Usar la fecha de compra como fecha de instalación
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Marca esta opción solo si la fecha de compra del archivo
                    corresponde realmente al día en que se instaló la batería.
                    Las compras sin fecha de instalación quedan fuera del
                    seguimiento postventa.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Formato esperado
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {format.required.map((column) => (
                    <code
                      key={column}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                    >
                      {column}
                    </code>
                  ))}
                  {format.optional?.map((column) => (
                    <code
                      key={column}
                      className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {column} (opcional)
                    </code>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {format.note}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  La primera fila debe contener los nombres de las columnas.
                </p>
              </div>
            </form>
          )}

          {!awaitingConfirmation && (
            <SheetFooter className="border-t border-border/60">
              <Button
                type="submit"
                form="import-form"
                disabled={submitting || !file}
              >
                {submitting && (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                )}
                {submitting ? "Subiendo…" : "Subir archivo"}
              </Button>
            </SheetFooter>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
