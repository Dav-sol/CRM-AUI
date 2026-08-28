"use client";

import { MessageSquare } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VariableInserter } from "@/components/campaigns/variable-inserter";
import { renderPreviewMessage, stageMomentLabel } from "@/lib/preview";
import type { FollowUpSequenceDetail } from "@/lib/sdk-types";

type CampaignStage = {
  id: string;
  name: string;
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

type MessageEditorProps = {
  stages: CampaignStage[];
  template: string;
  readOnly?: boolean;
  onTemplateChange: (template: string) => void;
  onStageChange: (
    stageId: string,
    updates: Partial<Pick<CampaignStage, "template" | "templateOnPast">>,
  ) => void;
};

export function MessageEditor({
  stages,
  template,
  readOnly = false,
  onTemplateChange,
  onStageChange,
}: MessageEditorProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Mensajes de la campaña
        </h2>
        <p className="text-xs text-muted-foreground">
          El mensaje principal se usa como fallback. Las etapas de la secuencia
          pueden tener mensajes personalizados.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="main-template">Mensaje principal (fallback)</Label>
        <VariableInserter
          onInsert={(key) => {
            onTemplateChange(`${template}${key}`);
          }}
        />
        <Textarea
          id="main-template"
          placeholder="Hola {customerName}, tu batería {productName} tiene garantía vigente…"
          rows={4}
          maxLength={4096}
          className="resize-none text-sm"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
        />
        {template && (
          <div className="rounded-md border border-border/50 bg-muted/20 p-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Preview:
            </p>
            <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
              {renderPreviewMessage(template)}
            </p>
          </div>
        )}
      </div>

      {stages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            Mensajes por etapa ({stages.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Si una etapa queda vacía, se usa el mensaje principal.
          </p>

          <div className="space-y-3">
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
                  className="rounded-lg border border-border/60 bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium">
                      {stage.name || `Etapa ${index + 1}`}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      · {stageMomentLabel(stage.anchor, stage.offsetDays)}
                    </span>
                  </div>

                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        Plantilla principal
                      </Label>
                      {readOnly ? (
                        <p className="mt-1 rounded-md border border-border/50 bg-muted/20 p-2 text-xs whitespace-pre-wrap">
                          {renderPreviewMessage(stage.template)}
                        </p>
                      ) : (
                        <Textarea
                          placeholder="Usa el mensaje principal si está vacío"
                          rows={2}
                          maxLength={4096}
                          className="mt-1 resize-none text-xs"
                          value={stage.template}
                          onChange={(e) =>
                            onStageChange(stage.id, {
                              template: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>

                    {!readOnly && (
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          Si la etapa ya pasó (opcional)
                        </Label>
                        <Textarea
                          placeholder="Oferta de recompra para clientes que ya pasaron esta etapa"
                          rows={2}
                          maxLength={4096}
                          className="mt-1 resize-none text-xs"
                          value={stage.templateOnPast ?? ""}
                          onChange={(e) =>
                            onStageChange(stage.id, {
                              templateOnPast: e.target.value || undefined,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>

                  {stage.template && (
                    <div className="mt-2 rounded-md border border-border/50 bg-muted/20 p-2">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Preview:
                      </p>
                      <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                        {renderPreviewMessage(stage.template)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
