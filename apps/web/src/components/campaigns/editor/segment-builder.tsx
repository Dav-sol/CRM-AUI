"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  apiPreviewCampaignSegmentDraft,
} from "@/lib/api";
import type { ProductItem } from "@/lib/sdk-types";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

type SegmentCriterion = {
  city?: string;
  productIds?: string[];
  purchaseFrom?: string;
  purchaseTo?: string;
  customerStatus?: "ACTIVE" | "INACTIVE" | "BLOCKED" | "";
  warrantyExpiresFrom?: string;
  warrantyExpiresTo?: string;
  warrantyMonths?: number | typeof NaN;
};

type SegmentBuilderProps = {
  products: ProductItem[];
  segment?: Record<string, unknown>;
  followUpSequenceId?: string;
  type?: string;
  onChange: (segment: Record<string, unknown> | undefined) => void;
};

export function SegmentBuilder({
  products,
  segment,
  followUpSequenceId,
  type,
  onChange,
}: SegmentBuilderProps) {
  const [preview, setPreview] = useState<{
    count: number;
    estimatedAutomations: number;
    estimatedCost: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const criterion: SegmentCriterion = useMemo(
    () => (segment ?? {}) as SegmentCriterion,
    [segment],
  );

  const hasCriterion =
    Boolean(criterion.city?.trim()) ||
    (criterion.productIds && criterion.productIds.length > 0) ||
    Boolean(criterion.purchaseFrom) ||
    Boolean(criterion.purchaseTo) ||
    Boolean(criterion.customerStatus) ||
    Boolean(criterion.warrantyExpiresFrom) ||
    Boolean(criterion.warrantyExpiresTo) ||
    (typeof criterion.warrantyMonths === "number" &&
      [12, 15, 18, 24].includes(criterion.warrantyMonths));

  const updateCriterion = useCallback(
    (updates: Partial<SegmentCriterion>) => {
      const next = { ...criterion, ...updates };
      // Clean empty values
      const cleaned: Record<string, unknown> = {};
      if (next.city?.trim()) cleaned.city = next.city.trim();
      if (next.productIds && next.productIds.length > 0)
        cleaned.productIds = next.productIds;
      if (next.purchaseFrom) cleaned.purchaseFrom = next.purchaseFrom;
      if (next.purchaseTo) cleaned.purchaseTo = next.purchaseTo;
      if (next.customerStatus) cleaned.customerStatus = next.customerStatus;
      if (next.warrantyExpiresFrom)
        cleaned.warrantyExpiresFrom = next.warrantyExpiresFrom;
      if (next.warrantyExpiresTo)
        cleaned.warrantyExpiresTo = next.warrantyExpiresTo;
      if (
        typeof next.warrantyMonths === "number" &&
        [12, 15, 18, 24].includes(next.warrantyMonths)
      ) {
        cleaned.warrantyMonths = next.warrantyMonths;
      }
      onChange(Object.keys(cleaned).length > 0 ? cleaned : undefined);
    },
    [criterion, onChange],
  );

  const toggleProduct = useCallback(
    (productId: string) => {
      const current = criterion.productIds ?? [];
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      updateCriterion({ productIds: next.length > 0 ? next : undefined });
    },
    [criterion.productIds, updateCriterion],
  );

  const clearAllProducts = useCallback(() => {
    updateCriterion({ productIds: undefined });
  }, [updateCriterion]);

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await apiPreviewCampaignSegmentDraft({
        segment: criterion as Record<string, unknown>,
        followUpSequenceId: followUpSequenceId || undefined,
        type: type as "AUTOMATIC" | "MANUAL" | "REPURCHASE" | "SPECIAL" | undefined,
      });
      setPreview(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      setPreviewError("No se pudo calcular la audiencia.");
    } finally {
      setPreviewLoading(false);
    }
  }, [criterion, followUpSequenceId, type]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Segmentación de audiencia
        </h2>
        <p className="text-xs text-muted-foreground">
          Define a qué clientes se les enviará esta campaña. Si no seleccionas
          ningún filtro, se aplicará a todos los clientes.
        </p>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border/60 p-4">
        <legend className="px-1 text-sm font-medium">
          Filtros de segmentación
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seg-city">Ciudad</Label>
            <Input
              id="seg-city"
              placeholder="Quito"
              maxLength={200}
              value={criterion.city ?? ""}
              onChange={(e) => updateCriterion({ city: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seg-status">Estado del cliente</Label>
            <select
              id="seg-status"
              className={cn(selectClass, "appearance-none")}
              value={criterion.customerStatus ?? ""}
              onChange={(e) =>
                updateCriterion({
                  customerStatus: e.target.value as SegmentCriterion["customerStatus"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="BLOCKED">Bloqueado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seg-from">Compra desde</Label>
            <Input
              id="seg-from"
              type="date"
              value={criterion.purchaseFrom ?? ""}
              onChange={(e) => updateCriterion({ purchaseFrom: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seg-to">Compra hasta</Label>
            <Input
              id="seg-to"
              type="date"
              value={criterion.purchaseTo ?? ""}
              onChange={(e) => updateCriterion({ purchaseTo: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seg-warranty-from">Garantía vence desde</Label>
            <Input
              id="seg-warranty-from"
              type="date"
              value={criterion.warrantyExpiresFrom ?? ""}
              onChange={(e) =>
                updateCriterion({ warrantyExpiresFrom: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seg-warranty-to">Garantía vence hasta</Label>
            <Input
              id="seg-warranty-to"
              type="date"
              value={criterion.warrantyExpiresTo ?? ""}
              onChange={(e) =>
                updateCriterion({ warrantyExpiresTo: e.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seg-warranty-months">Duración garantía (meses)</Label>
          <select
            id="seg-warranty-months"
            className={cn(selectClass, "appearance-none")}
            value={
              typeof criterion.warrantyMonths === "number"
                ? criterion.warrantyMonths
                : ""
            }
            onChange={(e) => {
              const val = Number(e.target.value);
              updateCriterion({ warrantyMonths: isNaN(val) ? NaN : val });
            }}
          >
            <option value="">Todas</option>
            <option value={12}>12 meses</option>
            <option value={15}>15 meses</option>
            <option value={18}>18 meses</option>
            <option value={24}>24 meses</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border/60 p-4">
        <legend className="px-1 text-sm font-medium">
          Productos (AND con grupos OR)
        </legend>
        <p className="text-xs text-muted-foreground">
          Selecciona uno o más productos. Si seleccionas varios, el cliente debe
          tener al menos uno de ellos (OR).
        </p>

        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay productos disponibles.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {products.map((product) => {
                const selected =
                  criterion.productIds?.includes(product.id) ?? false;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProduct(product.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      selected
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                    )}
                  >
                    {product.name}
                    {selected && (
                      <X className="size-3" />
                    )}
                  </button>
                );
              })}
            </div>
            {criterion.productIds && criterion.productIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {criterion.productIds.length} producto(s) seleccionado(s)
                </span>
                <button
                  type="button"
                  onClick={clearAllProducts}
                  className="text-[11px] text-muted-foreground underline hover:text-foreground"
                >
                  Limpiar
                </button>
              </div>
            )}
          </>
        )}
      </fieldset>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasCriterion || previewLoading}
            onClick={() => void handlePreview()}
          >
            {previewLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Calcular audiencia"
            )}
          </Button>
          {hasCriterion && (
            <p className="text-[11px] text-muted-foreground">
              Estima a quién se contactará y cuánto costaría activar.
            </p>
          )}
        </div>
        {previewError && (
          <p className="mt-2 text-xs text-destructive">{previewError}</p>
        )}
        {preview && (
          <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
            <p className="font-medium text-foreground">
              ~{preview.count} clientes · ~{preview.estimatedAutomations}{" "}
              mensajes
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Costo estimado: ~${formatCurrency(preview.estimatedCost)} COP por
              mensaje
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
