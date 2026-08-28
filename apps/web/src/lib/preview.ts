// Fase P0-A: preview de mensajes con variables renderizadas (datos de ejemplo)
// y etiquetas legibles de cuándo se envía cada etapa.

import { PREVIEW_SAMPLE, renderTemplate } from "@/lib/variables";

export function renderPreviewMessage(
  template: string | null | undefined,
): string {
  if (!template) {
    return "";
  }
  return renderTemplate(template, PREVIEW_SAMPLE);
}

export function stageMomentLabel(
  anchor: string,
  offsetDays: number,
): string {
  if (anchor === "PURCHASE_DATE") {
    if (offsetDays === 0) {
      return "Compra · el mismo día";
    }
    return `Compra · ${offsetDays} días después`;
  }
  if (offsetDays === 0) {
    return "Vencimiento · el día";
  }
  if (offsetDays < 0) {
    return `Vencimiento · ${Math.abs(offsetDays)} días antes`;
  }
  return `Vencimiento · ${offsetDays} días después`;
}