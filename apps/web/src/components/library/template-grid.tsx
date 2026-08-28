"use client";

import { Copy, Eye, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TemplateItem } from "@/lib/sdk-types";

const TONE_LABELS: Record<string, string> = {
  PROFESSIONAL: "Profesional",
  CARIBE_COMMERCIAL: "Comercial caribeño",
  CARIBE_AUTHENTIC: "Caribe auténtico",
};

const ANGLE_LABELS: Record<string, string> = {
  TRUST: "Confianza",
  PREVENTION: "Prevención",
  REPURCHASE: "Recompra",
  LOYALTY: "Fidelización",
  CONVERSATION: "Conversación",
  CALM: "Tranquilidad",
};

const TONE_COLORS: Record<string, string> = {
  PROFESSIONAL: "bg-blue-100 text-blue-800",
  CARIBE_COMMERCIAL: "bg-orange-100 text-orange-800",
  CARIBE_AUTHENTIC: "bg-emerald-100 text-emerald-800",
};

interface TemplateGridProps {
  templates: TemplateItem[];
  onCopied?: () => void;
}

export function TemplateGrid({ templates, onCopied }: TemplateGridProps) {
  const [preview, setPreview] = useState<TemplateItem | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy(template: TemplateItem) {
    await navigator.clipboard.writeText(template.body);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <div
            key={t.uuid}
            className="group relative rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-tight line-clamp-2">
                {t.name}
              </h3>
              {t.code && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {t.code}
                </Badge>
              )}
            </div>

            <p className="mb-3 text-xs text-muted-foreground line-clamp-3">
              {t.body}
            </p>

            <div className="mb-3 flex flex-wrap gap-1">
              <Badge
                variant="secondary"
                className={`text-xs ${TONE_COLORS[t.tone] ?? ""}`}
              >
                {TONE_LABELS[t.tone] ?? t.tone}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {ANGLE_LABELS[t.angle] ?? t.angle}
              </Badge>
            </div>

            {t.goal && (
              <p className="mb-3 text-xs text-muted-foreground italic line-clamp-1">
                {t.goal}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPreview(t)}
              >
                <Eye className="mr-1 size-3" />
                Ver
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleCopy(t)}
              >
                <Copy className="mr-1 size-3" />
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{preview.name}</h2>
                <div className="mt-1 flex gap-2">
                  {preview.code && (
                    <Badge variant="secondary">{preview.code}</Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className={TONE_COLORS[preview.tone] ?? ""}
                  >
                    {TONE_LABELS[preview.tone] ?? preview.tone}
                  </Badge>
                  <Badge variant="outline">
                    {ANGLE_LABELS[preview.angle] ?? preview.angle}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreview(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {preview.group && (
              <p className="mb-2 text-xs text-muted-foreground">
                {preview.group}
              </p>
            )}
            {preview.goal && (
              <p className="mb-2 text-xs text-muted-foreground italic">
                Objetivo: {preview.goal}
              </p>
            )}
            {preview.recommendedUse && (
              <p className="mb-4 text-xs text-muted-foreground">
                Uso recomendado: {preview.recommendedUse}
              </p>
            )}
            <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">
              {preview.body}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => handleCopy(preview)}
            >
              <Copy className="mr-1 size-3" />
              Copiar plantilla
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
