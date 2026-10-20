"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AutomationStatusBadge } from "@/components/automations/automation-list";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, apiGetAutomation } from "@/lib/api";
import { formatCivilDateTime, formatDateTime, formatPhone } from "@/lib/format";
import type { AutomationDetail } from "@/lib/sdk-types";

type AutomationDetailSheetProps = {
  uuid: string | null;
  onClose: () => void;
};

type LoadedState =
  | { uuid: string; detail: AutomationDetail; error: null }
  | { uuid: string; detail: null; error: string };

export function AutomationDetailSheet({
  uuid,
  onClose,
}: AutomationDetailSheetProps) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);

  useEffect(() => {
    if (uuid === null) {
      return;
    }
    let cancelled = false;

    void apiGetAutomation(uuid)
      .then((detail) => {
        if (!cancelled) {
          setLoaded({ uuid, detail, error: null });
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          return;
        }
        setLoaded({
          uuid,
          detail: null,
          error: "No se pudo cargar el detalle de la automatización.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const state = loaded?.uuid === uuid ? loaded : null;

  return (
    <Sheet open={uuid !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Detalle de automatización</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!state ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : state.detail ? (
            <AutomationDetailContent detail={state.detail} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AutomationDetailContent({ detail }: { detail: AutomationDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Estado</span>
        <AutomationStatusBadge status={detail.status} />
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Cliente</span>
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{detail.customer.name}</p>
          {detail.customer.uuid && (
            <Link
              href={`/customers/${detail.customer.uuid}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver cliente 360 →
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatPhone(detail.customer.phone)}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Compra</span>
        <p className="font-medium">
          Factura {detail.purchase.invoiceNumber} ·{" "}
          {detail.purchase.productName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCivilDateTime(detail.purchase.purchaseDate)}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Fechas</span>
        <p className="font-medium">
          Programada {formatDateTime(detail.scheduledDate)}
        </p>
        {detail.executedDate && (
          <p className="text-xs text-muted-foreground">
            Ejecutada {formatDateTime(detail.executedDate)}
          </p>
        )}
      </div>
      {detail.stageName && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Motivo</span>
          <p className="font-medium">{detail.stageName}</p>
        </div>
      )}
      {detail.campaign && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Campaña</span>
          <p className="font-medium">{detail.campaign.name}</p>
        </div>
      )}
      {detail.renderedMessage && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Mensaje personalizado</span>
          <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs whitespace-pre-wrap">
            {detail.renderedMessage}
          </p>
          {detail.messageTemplate && (
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
                Ver plantilla original
              </summary>
              <p className="mt-1 rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
                {detail.messageTemplate}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
