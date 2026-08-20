"use client";

import {
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
import { ApiError, apiActivateCampaign, apiCancelCampaign, apiPauseCampaign, apiResumeCampaign } from "@/lib/api";
import type { CampaignItem } from "@/lib/sdk-types";

type CampaignActionsProps = {
  uuid: string;
  status: CampaignItem["status"];
  onChanged: () => void;
};

export function CampaignActions({ uuid, status, onChanged }: CampaignActionsProps) {
  const [pending, setPending] = useState<"activate" | "pause" | "resume" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const terminal = status === "FINISHED" || status === "CANCELLED";
  if (terminal) {
    return null;
  }

  async function run(action: "activate" | "pause" | "resume" | "cancel") {
    setPending(action);
    try {
      switch (action) {
        case "activate":
          await apiActivateCampaign(uuid);
          break;
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
      toast.success("Campaña actualizada");
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "No se pudo actualizar la campaña");
    } finally {
      setPending(null);
      setConfirmCancel(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmCancel(false); }}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones de campaña" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "DRAFT" && (
          <DropdownMenuItem
            onClick={() => void run("activate")}
            disabled={pending !== null}
          >
            <Play />
            {pending === "activate" ? "Activando…" : "Activar"}
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
  );
}