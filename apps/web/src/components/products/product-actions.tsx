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
import { ApiError, apiDeleteProduct } from "@/lib/api";
import type { ProductItem } from "@/lib/sdk-types";
import { ProductFormSheet } from "./product-form-sheet";

type ProductActionsProps = {
  product: ProductItem;
  onChanged: () => void;
};

export function ProductActions({ product, onChanged }: ProductActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await apiDeleteProduct(product.id);
      toast.success("Producto eliminado");
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "No se pudo eliminar el producto");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(false);
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Acciones de producto"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          {!confirmDelete ? (
            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
            >
              <Trash2 />
              Eliminar producto
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void remove()}
              disabled={deleting}
            >
              <Trash2 />
              {deleting ? "Eliminando…" : "Confirmar eliminación"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ProductFormSheet
        product={product}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
    </>
  );
}