"use client";

import {
  AlertTriangle,
  Megaphone,
  Shield,
  Tag,
  Calendar,
  MessageCircle,
  MessageSquare,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { renderPreviewMessage, stageMomentLabel } from "@/lib/preview";
import type { FollowUpSequenceDetail, ProductItem } from "@/lib/sdk-types";
import { CAMPAIGN_TYPE_LABELS } from "@/lib/validators";

type CampaignStage = {
  id: string;
  name: string;
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

type CampaignReviewProps = {
  values: {
    name: string;
    description?: string;
    type: string;
    followUpSequenceId?: string;
    template?: string;
    startAt?: string;
    segment?: Record<string, unknown>;
  };
  stages: CampaignStage[];
  sequence: FollowUpSequenceDetail | null;
  products: ProductItem[];
  channel?: "WHATSAPP" | "SMS";
};

export function CampaignReview({
  values,
  stages,
  sequence,
  products,
  channel = "WHATSAPP",
}: CampaignReviewProps) {
  const segment = values.segment as Record<string, unknown> | undefined;

  const selectedProducts = segment?.productIds
    ? products.filter((p) =>
        (segment.productIds as string[]).includes(p.id),
      )
    : [];

  const segmentCriteria: string[] = [];
  if (segment?.city) segmentCriteria.push(`Ciudad: ${segment.city}`);
  if (selectedProducts.length > 0) {
    segmentCriteria.push(
      `Productos: ${selectedProducts.map((p) => p.name).join(", ")}`,
    );
  }
  if (segment?.customerStatus)
    segmentCriteria.push(`Estado: ${segment.customerStatus}`);
  if (segment?.purchaseFrom)
    segmentCriteria.push(`Compra desde: ${segment.purchaseFrom}`);
  if (segment?.purchaseTo)
    segmentCriteria.push(`Compra hasta: ${segment.purchaseTo}`);
  if (segment?.warrantyExpiresFrom)
    segmentCriteria.push(
      `Garantía vence desde: ${segment.warrantyExpiresFrom}`,
    );
  if (segment?.warrantyExpiresTo)
    segmentCriteria.push(
      `Garantía vence hasta: ${segment.warrantyExpiresTo}`,
    );
  if (typeof segment?.warrantyMonths === "number") {
    segmentCriteria.push(`Garantía: ${segment.warrantyMonths} meses`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Revisión de la campaña
        </h2>
        <p className="text-xs text-muted-foreground">
          Revisa la configuración antes de crear la campaña.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-start gap-3">
            <Megaphone className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-sm font-medium">
                {values.name || "Sin nombre"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {values.description || "Sin descripción"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-[11px]">
                  {CAMPAIGN_TYPE_LABELS[values.type] ?? values.type}
                </Badge>
                <Badge variant="secondary" className="text-[11px] flex items-center gap-1">
                  {channel === "WHATSAPP" ? (
                    <MessageCircle className="size-3" />
                  ) : (
                    <MessageSquare className="size-3" />
                  )}
                  {channel === "WHATSAPP" ? "WhatsApp" : "SMS"}
                </Badge>
                {sequence && (
                  <Badge variant="secondary" className="text-[11px]">
                    {sequence.name}
                  </Badge>
                )}
                {values.startAt && (
                  <Badge variant="secondary" className="text-[11px]">
                    {new Date(values.startAt).toLocaleDateString("es-EC")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-start gap-3">
            <Tag className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-sm font-medium">Segmentación</h3>
              {segmentCriteria.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sin filtros — se aplicará a todos los clientes.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {segmentCriteria.map((criteria) => (
                    <li
                      key={criteria}
                      className="text-xs text-muted-foreground"
                    >
                      · {criteria}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-sm font-medium">
                Timeline ({stages.length} etapas)
              </h3>
              {stages.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sin etapas definidas.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {[...stages]
                    .sort((a, b) => {
                      if (a.anchor !== b.anchor) {
                        return a.anchor === "PURCHASE_DATE" ? -1 : 1;
                      }
                      return a.offsetDays - b.offsetDays;
                    })
                    .map((stage, index) => (
                      <div
                        key={stage.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {index + 1}.
                        </span>
                        <span className="font-medium">
                          {stageMomentLabel(stage.anchor, stage.offsetDays)}
                        </span>
                        <span className="text-muted-foreground">—</span>
                        <span className="truncate text-muted-foreground">
                          {stage.name || `Etapa ${index + 1}`}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-sm font-medium">Mensajes por etapa</h3>
              {stages.filter((s) => s.template).length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ninguna etapa tiene un mensaje personalizado. Cada etapa debe
                  definir su plantilla para enviar mensajes.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {stages
                    .filter((s) => s.template)
                    .map((stage) => (
                      <div
                        key={stage.id}
                        className="rounded-md border border-border/50 bg-muted/20 p-2"
                      >
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {stage.name || "Etapa"} ·{" "}
                          {stageMomentLabel(stage.anchor, stage.offsetDays)}
                        </p>
                        <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                          {renderPreviewMessage(stage.template)}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {!values.name && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 text-yellow-600" />
            <div className="text-xs">
              <p className="font-medium text-yellow-600">
                Faltan campos obligatorios
              </p>
              <ul className="mt-1 space-y-0.5 text-yellow-600/80">
                {!values.name && <li>· Nombre de la campaña</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
