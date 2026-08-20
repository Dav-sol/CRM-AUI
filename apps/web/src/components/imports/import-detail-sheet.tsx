"use client";

import { AlertTriangle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, apiCancelImportJob, apiGetImportJob, apiRetryImportJob } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ImportErrorSample, ImportJobItem } from "@/lib/sdk-types";
import { IMPORT_TYPE_LABELS } from "@/lib/validators";
import { ImportStatusBadge } from "./import-list";

const ACTIVE_STATUSES = new Set(["PENDING", "VALIDATING", "PROCESSING"]);

type ImportDetailSheetProps = {
  job: ImportJobItem | null;
  onClose: () => void;
  onChanged?: () => void;
};

export function ImportDetailSheet({ job, onClose, onChanged }: ImportDetailSheetProps) {
  const [detail, setDetail] = useState<ImportJobItem | null>(job);
  const [busy, setBusy] = useState<"cancel" | "retry" | null>(null);
  const [prevJob, setPrevJob] = useState(job);

  if (job !== prevJob) {
    setPrevJob(job);
    setDetail(job);
    setBusy(null);
  }

  const isActive = detail !== null && ACTIVE_STATUSES.has(detail.status);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timer = setInterval(async () => {
      if (!job) {
        return;
      }
      try {
        const next = await apiGetImportJob(job.uuid);
        setDetail(next);
      } catch {
        clearInterval(timer);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [isActive, job]);

  async function cancel() {
    if (!detail) {
      return;
    }
    setBusy("cancel");
    try {
      await apiCancelImportJob(detail.uuid);
      toast.success("Importación cancelada");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo cancelar");
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    if (!detail) {
      return;
    }
    setBusy("retry");
    try {
      await apiRetryImportJob(detail.uuid);
      toast.success("Importación reprogramada");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo reintentar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle className="truncate">{detail?.fileName ?? "Importación"}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {IMPORT_TYPE_LABELS[detail?.type ?? "CUSTOMERS"]}
              {detail && <ImportStatusBadge status={detail.status} />}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatNumber(detail.totalRecords)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Procesadas</p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatNumber(detail.processedRecords)}
                    </p>
                  </div>
                  <div
                    className={`rounded-lg border border-border/60 p-3 ${
                      detail.errorRecords > 0 ? "bg-destructive/5" : ""
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">Con errores</p>
                    <p className="mt-1 text-lg font-semibold">
                      {formatNumber(detail.errorRecords)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Iniciada</p>
                    <p>{formatDateTime(detail.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Finalizada</p>
                    <p>{formatDateTime(detail.completedAt)}</p>
                  </div>
                </div>

                {isActive && (
                  <p className="text-xs text-muted-foreground">
                    La importación se está procesando en segundo plano. Esta pantalla se
                    actualiza sola.
                  </p>
                )}

                {detail.errorRecords > 0 && (
                  <ErrorSamples samples={detail.errorsSummary.samples} />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 p-4">
            {isActive && (
              <Button
                variant="outline"
                onClick={() => void cancel()}
                disabled={busy !== null}
              >
                {busy === "cancel" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle />
                )}
                Cancelar
              </Button>
            )}
            {(detail?.status === "FAILED" || detail?.status === "PARTIAL") && (
              <Button
                variant="outline"
                onClick={() => void retry()}
                disabled={busy !== null}
              >
                {busy === "retry" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw />
                )}
                Reintentar
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ErrorSamples({ samples }: { samples: ImportErrorSample[] }) {
  if (samples.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border/60">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium">Filas con errores</p>
      </div>
      <ul className="divide-y divide-border/60">
        {samples.map((sample, index) => (
          <li key={index} className="px-3 py-2 text-xs">
            <p className="font-medium">
              Fila {sample.row}
              {sample.field ? ` · ${sample.field}` : ""}
            </p>
            <p className="mt-0.5 text-muted-foreground">{sample.message}</p>
            {sample.raw ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
                {sample.raw}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}