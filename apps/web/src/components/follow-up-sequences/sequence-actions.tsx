"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, apiDeleteFollowUpSequence } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-provider";

const MANAGE_ROLES = new Set(["ADMINISTRADOR", "GERENTE"]);

type SequenceActionsProps = {
  uuid: string;
  onChanged: () => void;
  onEdit: () => void;
};

export function SequenceActions({ uuid, onChanged, onEdit }: SequenceActionsProps) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // HG-FUS-01: only ADMINISTRADOR/GERENTE manage sequences; other roles see no
  // actions (same hide-not-disable pattern as AutomationActions).
  if (!MANAGE_ROLES.has(user?.role ?? "")) {
    return null;
  }

  async function deleteSequence() {
    setPending(true);
    try {
      await apiDeleteFollowUpSequence(uuid);
      toast.success("Secuencia eliminada");
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "No se pudo eliminar la secuencia");
    } finally {
      setPending(false);
      setConfirmDelete(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones de secuencia" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit} disabled={pending}>
          <Pencil />
          Editar
        </DropdownMenuItem>
        {!confirmDelete ? (
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
          >
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void deleteSequence()}
            disabled={pending}
          >
            <Trash2 />
            {pending ? "Eliminando…" : "Confirmar eliminación"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}