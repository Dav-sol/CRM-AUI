"use client";

import { Badge } from "@/components/ui/badge";
import type { ConfigParamSource } from "@/lib/sdk-types";

/**
 * Origen del valor efectivo de un parámetro (specs/024-configuraciones-v1 §6):
 * `db` = configurado aquí, `env` = heredado de la instalación, `default` =
 * valor por defecto del código.
 */
const SOURCE_LABELS: Record<ConfigParamSource, string> = {
  db: "Configurado",
  env: "Del servidor",
  default: "Por defecto",
};

const SOURCE_VARIANTS: Record<
  ConfigParamSource,
  "default" | "secondary" | "outline"
> = {
  db: "default",
  env: "secondary",
  default: "outline",
};

export function SourceBadge({
  source,
  className,
}: {
  source: ConfigParamSource;
  className?: string;
}) {
  return (
    <Badge variant={SOURCE_VARIANTS[source]} className={className}>
      {SOURCE_LABELS[source]}
    </Badge>
  );
}
