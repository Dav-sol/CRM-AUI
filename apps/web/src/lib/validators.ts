import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const replySchema = z.object({
  content: z
    .string()
    .min(1, "El mensaje no puede estar vacío")
    .max(4096, "El mensaje no puede superar los 4096 caracteres"),
});

export type ReplyFormValues = z.infer<typeof replySchema>;

export const noteSchema = z.object({
  content: z
    .string()
    .min(1, "La nota no puede estar vacía")
    .max(4000, "La nota no puede superar los 4000 caracteres"),
});

export type NoteFormValues = z.infer<typeof noteSchema>;

export const customerSchema = z.object({
  codcli: z
    .string()
    .trim()
    .min(1, "Ingresá el código de cliente")
    .max(50, "El código no puede superar los 50 caracteres"),
  name: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre del cliente")
    .max(200, "El nombre no puede superar los 200 caracteres"),
  phone: z
    .string()
    .trim()
    .max(30, "El teléfono no puede superar los 30 caracteres")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(200, "El email no puede superar los 200 caracteres")
    .email("Ingresá un email válido")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .trim()
    .max(200, "La dirección no puede superar los 200 caracteres")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .trim()
    .max(200, "La ciudad no puede superar los 200 caracteres")
    .optional()
    .or(z.literal("")),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export const purchaseSchema = z.object({
  customerId: z.string().min(1, "Seleccioná un cliente"),
  productId: z.string().min(1, "Seleccioná un producto"),
  invoiceNumber: z
    .string()
    .trim()
    .min(1, "Ingresá el número de factura")
    .max(50, "El número de factura no puede superar los 50 caracteres"),
  purchaseDate: z.string().min(1, "Ingresá la fecha de compra"),
  quantity: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? NaN : value),
    z.coerce
      .number({ message: "Ingresá la cantidad" })
      .int("La cantidad debe ser un número entero")
      .min(1, "La cantidad debe ser al menos 1"),
  ),
  value: z
    .string()
    .trim()
    .min(1, "Ingresá el valor de la compra")
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "El valor debe ser un monto válido (ej: 125.50)"),
  status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED"]).default("COMPLETED"),
});

export type PurchaseFormValues = z.output<typeof purchaseSchema>;
export type PurchaseFormInput = z.input<typeof purchaseSchema>;

export const campaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre de la campaña")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  description: z
    .string()
    .trim()
    .max(1000, "La descripción no puede superar los 1000 caracteres")
    .optional()
    .or(z.literal("")),
  type: z.enum(["AUTOMATIC", "MANUAL", "REPURCHASE", "SPECIAL"]),
  template: z
    .string()
    .trim()
    .min(1, "Ingresá el mensaje de la campaña")
    .max(4096, "El mensaje no puede superar los 4096 caracteres"),
  startAt: z
    .string()
    .min(1, "Ingresá la fecha de inicio")
    .optional()
    .or(z.literal("")),
  segment: z
    .object({
      city: z.string().trim().max(200, "La ciudad no puede superar los 200 caracteres"),
      productId: z.string(),
      purchaseFrom: z.string(),
      purchaseTo: z.string(),
      customerStatus: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).or(z.literal("")),
    })
    .partial()
    .optional(),
});

export type CampaignFormValues = z.output<typeof campaignSchema>;

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};

export const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  AUTOMATIC: "Automática",
  MANUAL: "Manual",
  REPURCHASE: "Recompra",
  SPECIAL: "Especial",
};