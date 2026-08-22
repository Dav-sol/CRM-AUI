"use client";

import { useEffect, useState } from "react";

import { Calendar, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, apiGetFollowUpSequence } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { FollowUpSequenceDetail } from "@/lib/sdk-types";

type SequenceDetailSheetProps = {
  uuid: string | null;
  onClose: () => void;
};

type LoadedState =
  | { uuid: string; detail: FollowUpSequenceDetail; error: null }
  | { uuid: string; detail: null; error: string };

export function SequenceDetailSheet({
  uuid,
  onClose,
}: SequenceDetailSheetProps) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);

  useEffect(() => {
    if (uuid === null) {
      return;
    }
    let cancelled = false;

    void apiGetFollowUpSequence(uuid)
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
          error: "No se pudo cargar el detalle de la secuencia.",
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
          <SheetTitle>Detalle de secuencia</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!state ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : state.detail ? (
            <SequenceDetailContent detail={state.detail} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function stageMomentLabel(
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY",
  offsetDays: number,
): string {
  if (anchor === "PURCHASE_DATE") {
    return offsetDays === 0
      ? "Día de la compra"
      : `Compra · ${offsetDays} días después`;
  }
  if (offsetDays === 0) return "Día del vencimiento";
  if (offsetDays < 0) return `Vencimiento · ${Math.abs(offsetDays)} días antes`;
  return `Vencimiento · ${offsetDays} días después`;
}

function SequenceDetailContent({ detail }: { detail: FollowUpSequenceDetail }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Nombre</span>
        <p className="font-medium">{detail.name}</p>
      </div>
      {detail.description && (
        <div className="space-y-1">
          <span className="text-muted-foreground">Descripción</span>
          <p className="font-medium">{detail.description}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Garantía</span>
        <div className="flex items-center gap-2">
          <Shield className="size-4" />
          <span className="font-medium">{detail.warrantyMonths} meses</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Etapas</span>
        <p className="font-medium">{detail.stageCount}</p>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Etapas programadas</span>
        <div className="flex flex-wrap gap-2">
          {detail.stages.map((stage) => (
            <Badge key={stage.uuid} variant="outline" className="gap-1">
              <Calendar className="size-3" />
              {stageMomentLabel(
                stage.anchor ?? "WARRANTY_EXPIRY",
                stage.offsetDays,
              )}
            </Badge>
          ))}
        </div>
      </div>
      {detail.stages.length > 0 && (
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground mb-2">
            Detalle de etapas:
          </p>
          <div className="space-y-2">
            {detail.stages.map((stage) => (
              <div key={stage.uuid} className="space-y-1">
                <p className="text-xs font-medium">
                  {stageMomentLabel(
                    stage.anchor ?? "WARRANTY_EXPIRY",
                    stage.offsetDays,
                  )}
                  <span className="text-muted-foreground ml-2">
                    {stage.name}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {stage.template}
                </p>
                {stage.templateOnPast && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    Recompra: {stage.templateOnPast}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between pt-4 border-t border-border/60">
        <span className="text-muted-foreground">Creada</span>
        <p className="font-medium">{formatDate(detail.createdAt)}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Actualizada</span>
        <p className="font-medium">{formatDate(detail.updatedAt)}</p>
      </div>
    </div>
  );
}
