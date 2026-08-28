"use client";

import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  RotateCcw,
  AlertTriangle,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FollowUpSequenceDetail } from "@/lib/sdk-types";
import { stageMomentLabel } from "@/lib/preview";

type CampaignStage = {
  id: string;
  name: string;
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

type TimelineViewProps = {
  stages: CampaignStage[];
  sequence: FollowUpSequenceDetail | null;
  readOnly?: boolean;
  onAddStage: () => void;
  onEditStage: (stage: CampaignStage) => void;
  onDeleteStage: (stageId: string) => void;
};

function getStageIcon(stage: CampaignStage) {
  if (stage.offsetDays < -30) return AlertTriangle;
  if (stage.offsetDays < 0) return RotateCcw;
  if (stage.offsetDays === 0) return Shield;
  return Calendar;
}

export function TimelineView({
  stages,
  sequence,
  readOnly = false,
  onAddStage,
  onEditStage,
  onDeleteStage,
}: TimelineViewProps) {
  const sortedStages = [...stages].sort((a, b) => {
    if (a.anchor !== b.anchor) {
      return a.anchor === "PURCHASE_DATE" ? -1 : 1;
    }
    return a.offsetDays - b.offsetDays;
  });

  if (stages.length === 0 && !sequence) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Timeline de mensajes
          </h2>
          <p className="text-xs text-muted-foreground">
            Define las etapas de seguimiento y cuándo se envía cada mensaje.
          </p>
        </div>

        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay etapas definidas. Selecciona una secuencia existente o agrega
            etapas manualmente.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onAddStage}
          >
            <Plus className="mr-1.5 size-4" />
            Agregar primera etapa
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Timeline de mensajes
          </h2>
          <p className="text-xs text-muted-foreground">
            {sequence
              ? `Usando secuencia: ${sequence.name} (${sequence.warrantyMonths} meses) — etapas de solo lectura.`
              : "Define las etapas de seguimiento y cuándo se envía cada mensaje."}
          </p>
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddStage}
          >
            <Plus className="mr-1.5 size-4" />
            Agregar etapa
          </Button>
        )}
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border/60" />

        <div className="space-y-1">
          {sortedStages.map((stage, index) => {
            const Icon = getStageIcon(stage);
            return (
              <div
                key={stage.id}
                className="relative flex items-start gap-4 pl-2"
              >
                {/* Timeline node */}
                <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                  <Icon className="size-4 text-muted-foreground" />
                </div>

                {/* Stage content */}
                <div className="flex-1 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">
                        {stage.name || `Etapa ${index + 1}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {stageMomentLabel(stage.anchor, stage.offsetDays)}
                      </p>
                      {stage.template && (
                        <p className="mt-1.5 line-clamp-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
                          {stage.template}
                        </p>
                      )}
                      {stage.templateOnPast && (
                        <p className="mt-1 border-t border-border/40 pt-1 text-[11px] text-muted-foreground italic">
                          Si la etapa ya pasó: {stage.templateOnPast}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditStage(stage)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStage(stage.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
