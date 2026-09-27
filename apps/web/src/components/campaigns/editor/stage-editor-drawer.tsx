"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VariableInserter } from "@/components/campaigns/variable-inserter";
import { renderPreviewMessage } from "@/lib/preview";
import { cn } from "@/lib/utils";

type CampaignStage = {
  id: string;
  name: string;
  anchor: "PURCHASE_DATE" | "WARRANTY_EXPIRY";
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

type StageEditorDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CampaignStage | null;
  channel?: "WHATSAPP" | "SMS";
  onSave: (stage: CampaignStage) => void;
};

const selectClass =
  "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

export function StageEditorDrawer({
  open,
  onOpenChange,
  stage,
  channel,
  onSave,
}: StageEditorDrawerProps) {
  if (!stage) return null;

  return (
    <StageEditorDrawerContent
      key={stage.id}
      open={open}
      onOpenChange={onOpenChange}
      stage={stage}
      channel={channel}
      onSave={onSave}
    />
  );
}

function StageEditorDrawerContent({
  open,
  onOpenChange,
  stage,
  channel = "WHATSAPP",
  onSave,
}: StageEditorDrawerProps & { stage: CampaignStage }) {
  const maxLen = channel === "SMS" ? 160 : 4096;
  const [name, setName] = useState(stage.name);
  const [anchor, setAnchor] = useState<"PURCHASE_DATE" | "WARRANTY_EXPIRY">(
    stage.anchor,
  );
  const [offsetDays, setOffsetDays] = useState(stage.offsetDays);
  const [template, setTemplate] = useState(stage.template);
  const [templateOnPast, setTemplateOnPast] = useState(
    stage.templateOnPast ?? "",
  );

  const handleSave = () => {
    onSave({
      ...stage,
      name: name.trim(),
      anchor,
      offsetDays,
      template: template.trim(),
      templateOnPast: templateOnPast.trim() || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Editar etapa</SheetTitle>
          <SheetDescription>
            Configura cuándo se envía este mensaje y su contenido.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name">Nombre de la etapa</Label>
            <Input
              id="stage-name"
              placeholder="Ej: Bienvenida, Pre-vencimiento…"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="stage-anchor">Momento de referencia</Label>
              <select
                id="stage-anchor"
                className={cn(selectClass, "appearance-none")}
                value={anchor}
                onChange={(e) =>
                  setAnchor(
                    e.target.value as "PURCHASE_DATE" | "WARRANTY_EXPIRY",
                  )
                }
              >
                <option value="PURCHASE_DATE">Fecha de compra</option>
                <option value="WARRANTY_EXPIRY">Vencimiento de garantía</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-offset">Días de offset</Label>
              <Input
                id="stage-offset"
                type="number"
                value={offsetDays}
                onChange={(e) => setOffsetDays(e.target.valueAsNumber || 0)}
              />
              <p className="text-[11px] text-muted-foreground">
                {offsetDays === 0
                  ? "El mismo día"
                  : offsetDays > 0
                    ? `${offsetDays} días después`
                    : `${Math.abs(offsetDays)} días antes`}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Plantilla del mensaje</Label>
            <VariableInserter
              onInsert={(key) => {
                setTemplate((prev) => `${prev}${key}`);
              }}
            />
            <Textarea
              placeholder="Hola {customerName}, tu batería {productName}..."
              rows={4}
              maxLength={maxLen}
              className="resize-none text-sm"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
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

          <div className="space-y-2">
            <Label>Plantilla alternativa (si la etapa ya pasó)</Label>
            <VariableInserter
              onInsert={(key) => {
                setTemplateOnPast((prev) => `${prev}${key}`);
              }}
            />
            <Textarea
              placeholder="Oferta de recompra para clientes que ya pasaron esta etapa..."
              rows={3}
              maxLength={maxLen}
              className="resize-none text-sm"
              value={templateOnPast}
              onChange={(e) => setTemplateOnPast(e.target.value)}
            />
            {templateOnPast && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Preview:
                </p>
                <p className="mt-0.5 text-[11px] whitespace-pre-wrap">
                  {renderPreviewMessage(templateOnPast)}
                </p>
              </div>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Guardar etapa</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
