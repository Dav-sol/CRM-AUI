"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, apiCancelAutomation } from "@/lib/api";
import type { AutomationItem } from "@/lib/sdk-types";

const CANCEL_ROLES = new Set(["PLATFORM_OWNER", "ADMINISTRADOR", "GERENTE"]);

type AutomationActionsProps = {
  uuid: string;
  status: AutomationItem["status"];
  onChanged: () => void;
};

export function AutomationActions({ uuid, status, onChanged }: AutomationActionsProps) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const canCancel =
    CANCEL_ROLES.has(user?.role ?? "") && (status === "PENDING" || status === "SCHEDULED");

  if (!canCancel) {
    return null;
  }

  async function cancel() {
    setPending(true);
    try {
      await apiCancelAutomation(uuid);
      toast.success("Automatización cancelada");
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "No se pudo cancelar la automatización");
    } finally {
      setPending(false);
      setConfirmCancel(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmCancel(false); }}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones de automatización" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!confirmCancel ? (
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            onClick={() => setConfirmCancel(true)}
            disabled={pending}
          >
            <Trash2 />
            Cancelar automatización
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onClick={() => void cancel()} disabled={pending}>
            <Trash2 />
            {pending ? "Cancelando…" : "Confirmar cancelación"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}