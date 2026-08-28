// Fase 1: presets del recomendador para el editor full-page.
export type CampaignPreset = {
  key: string;
  label: string;
  description: string;
  values: {
    name: string;
    type: "AUTOMATIC" | "MANUAL" | "REPURCHASE" | "SPECIAL";
    template: string;
  };
};

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    key: "bienvenida",
    label: "Bienvenida",
    description: "Da la bienvenida y activa la garantía.",
    values: {
      name: "Bienvenida a nuevos clientes",
      type: "AUTOMATIC",
      template:
        "¡Hola {customerName}! Gracias por confiar en {organizationName}. Tu batería {productName} ya tiene tu garantía activa. Cuídala revisando el voltaje cada 3 meses.",
    },
  },
  {
    key: "garantia",
    label: "Recordatorio de garantía",
    description: "Avisa que la garantía está por vencer.",
    values: {
      name: "Recordatorio de garantía",
      type: "REPURCHASE",
      template:
        "Hola {customerName}, tu batería {productName} está por vencer su garantía. Te invitamos a una revisión gratuita en {organizationName}.",
    },
  },
  {
    key: "reactivacion",
    label: "Reactivación",
    description: "Trae de vuelta a clientes inactivos.",
    values: {
      name: "Reactivación de clientes",
      type: "REPURCHASE",
      template:
        "Hola {customerName}, en {organizationName} tenemos una oferta especial para renovar tu {productName}. ¡Te esperamos!",
    },
  },
];

export function findCampaignPreset(
  key: string | null | undefined,
): CampaignPreset | undefined {
  if (!key) return undefined;
  return CAMPAIGN_PRESETS.find((p) => p.key === key);
}
