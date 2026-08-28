"use client";

import {
  BadgeCheck,
  CirclePause,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ApiError,
  apiActivateCampaign,
  apiApproveCampaign,
  apiCancelCampaign,
  apiGetCampaign,
  apiPauseCampaign,
  apiPreviewCampaignSegment,
  apiResumeCampaign,
} from "@/lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { renderPreviewMessage, stageMomentLabel } from "@/lib/preview";
import type { CampaignItem } from "@/lib/sdk-types";

type CampaignActionsProps = {
  uuid: string;
  status: CampaignItem["status"];
  onChanged: () => void;
};

export function CampaignActions({
  uuid,
  status,
  onChanged,
}: CampaignActionsProps) {
  const [pending, setPending] = useState<
    "approve" | "activate" | "pause" | "resume" | "cancel" | null
  >(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Fase P0-B: confirmación obligatoria antes de activar (audiencia + costo).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    count: number;
    estimatedAutomations: number;
    estimatedCost: number;
    startAt: string | null;
    stages: Array<{
      uuid: string;
      name: string;
      anchor: string;
      offsetDays: number;
      template: string;
    }>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const terminal = status === "FINISHED" || status === "CANCELLED";
  if (terminal) {
    return null;
  }

  async function openActivateConfirm() {
    setConfirmOpen(true);
    setConfirmLoading(true);
    setConfirmData(null);
    try {
      const [campaign, preview] = await Promise.all([
        apiGetCampaign(uuid),
        apiPreviewCampaignSegment(uuid, undefined),
      ]);
      setConfirmData({
        count: preview.count,
        estimatedAutomations: preview.estimatedAutomations,
        estimatedCost: preview.estimatedCost,
        startAt: campaign.startAt ?? null,
        stages: (campaign.followUpSequence?.stages ?? []).map((stage) => ({
          uuid: stage.uuid,
          name: stage.name,
          anchor: stage.anchor,
          offsetDays: stage.offsetDays,
          template: stage.template,
        })),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      setConfirmData(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  async function run(
    action: "approve" | "activate" | "pause" | "resume" | "cancel",
  ) {
    setPending(action);
    try {
      let message = "Campaña actualizada";
      switch (action) {
        case "approve":
          await apiApproveCampaign(uuid);
          break;
        case "activate": {
          const result = await apiActivateCampaign(uuid);
          const skipped =
            (result?.skippedByLimit ?? 0) + (result?.skippedByFrequency ?? 0);
          if (skipped > 0) {
            message = `Campaña activada (${result?.automationCount ?? 0} mensajes; ${skipped} clientes omitidos por reglas de frecuencia)`;
          }
          break;
        }
        case "pause":
          await apiPauseCampaign(uuid);
          break;
        case "resume":
          await apiResumeCampaign(uuid);
          break;
        case "cancel":
          await apiCancelCampaign(uuid);
          break;
      }
      toast.success(message);
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No se pudo actualizar la campaña",
      );
    } finally {
      setPending(null);
      setConfirmCancel(false);
    }
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setConfirmCancel(false);
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Acciones de campaña"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "DRAFT" && (
            <DropdownMenuItem
              onClick={() => void run("approve")}
              disabled={pending !== null}
            >
              <BadgeCheck />
              {pending === "approve" ? "Aprobando…" : "Aprobar"}
            </DropdownMenuItem>
          )}
          {status === "APPROVED" && (
            <DropdownMenuItem
              onClick={() => void openActivateConfirm()}
              disabled={pending !== null}
            >
              <Play />
              Activar
            </DropdownMenuItem>
          )}
          {status === "ACTIVE" && (
            <DropdownMenuItem
              onClick={() => void run("pause")}
              disabled={pending !== null}
            >
              <CirclePause />
              {pending === "pause" ? "Pausando…" : "Pausar"}
            </DropdownMenuItem>
          )}
          {status === "PAUSED" && (
            <DropdownMenuItem
              onClick={() => void run("resume")}
              disabled={pending !== null}
            >
              <RotateCcw />
              {pending === "resume" ? "Reanudando…" : "Reanudar"}
            </DropdownMenuItem>
          )}
          {!confirmCancel ? (
            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
              onClick={() => setConfirmCancel(true)}
              disabled={pending !== null}
            >
              <Trash2 />
              Cancelar campaña
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void run("cancel")}
              disabled={pending !== null}
            >
              <Trash2 />
              {pending === "cancel" ? "Cancelando…" : "Confirmar cancelación"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Fase P0-B: confirmación obligatoria antes de activar */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Confirmar activación</SheetTitle>
            <SheetDescription>
              Verifica la audiencia y el costo estimado antes de activar la
              campaña.
            </SheetDescription>
          </SheetHeader>
          {confirmLoading || !confirmData ? (
            <div className="space-y-3 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {confirmData.count === 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Esta campaña no tiene audiencia. Revisa el segmento antes de
                  activar.
                </p>
              )}
              <p className="text-sm">
                Vas a activar esta campaña para{" "}
                <span className="font-semibold">
                  {formatNumber(confirmData.count)} clientes
                </span>
                .
              </p>
              <p className="text-sm">
                Se generarán aproximadamente{" "}
                <span className="font-semibold">
                  {formatNumber(confirmData.estimatedAutomations)} mensajes
                </span>
                .
              </p>
              <p className="text-sm">
                Costo estimado:{" "}
                <span className="font-semibold">
                  ${formatCurrency(confirmData.estimatedCost)} COP
                </span>{" "}
                (tarifa configurada por mensaje).
              </p>
              <p className="text-sm">
                Primera ejecución:{" "}
                <span className="font-medium">
                  {confirmData.startAt
                    ? formatDateTime(confirmData.startAt)
                    : "hoy"}
                </span>
                .
              </p>
              {confirmData.stages.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Mensajes que se enviarán:
                  </p>
                  <ul className="space-y-1.5">
                    {confirmData.stages.map((stage) => (
                      <li
                        key={stage.uuid}
                        className="rounded-md border border-border/60 bg-muted/20 p-2"
                      >
                        <p className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium">{stage.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {stageMomentLabel(stage.anchor, stage.offsetDays)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                          {renderPreviewMessage(stage.template)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
                Es un estimado: WhatsApp tiene costo real por mensaje. Algunos
                clientes pueden quedar fuera por reglas de frecuencia o por
                haber pedido no recibir comunicaciones.
              </p>
            </div>
          )}
          <SheetFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending !== null}
            >
              Volver a revisar
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void run("activate");
              }}
              disabled={
                pending !== null ||
                confirmLoading ||
                !confirmData ||
                confirmData.count === 0
              }
            >
              Activar campaña
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
