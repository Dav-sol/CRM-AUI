"use client";

import { useEffect, useState } from "react";

import { AutomationStatusBadge } from "@/components/automations/automation-list";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, apiGetAutomation } from "@/lib/api";
import { formatDateTime, formatPhone } from "@/lib/format";
import type { AutomationDetail } from "@/lib/sdk-types";

type AutomationDetailSheetProps = {
  uuid: string | null;
  onClose: () => void;
};

type LoadedState =
  | { uuid: string; detail: AutomationDetail; error: null }
  | { uuid: string; detail: null; error: string };

export function AutomationDetailSheet({ uuid, onClose }: AutomationDetailSheetProps) {
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
        setLoaded({ uuid, detail: null, error: "No se pudo cargar el detalle de la automatización." });
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
        <p className="font-medium">{detail.customer.name}</p>
        <p className="text-xs text-muted-foreground">{formatPhone(detail.customer.phone)}</p>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Compra</span>
        <p className="font-medium">
          Factura {detail.purchase.invoiceNumber} · {detail.purchase.productName}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(detail.purchase.purchaseDate)}</p>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Fechas</span>
        <p className="font-medium">Programada {formatDateTime(detail.scheduledDate)}</p>
        {detail.executedDate && (
          <p className="text-xs text-muted-foreground">
            Ejecutada {formatDateTime(detail.executedDate)}
          </p>
        )}
      </div>
      {detail.campaignId && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Campaña</span>
          <p className="font-medium">{detail.campaignId.slice(0, 8)}</p>
        </div>
      )}
    </div>
  );
}