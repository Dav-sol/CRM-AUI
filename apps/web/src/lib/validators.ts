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
  warrantyMonths: z.number().int().positive().max(24).optional(),
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
  followUpSequenceId: z.string().uuid().optional().or(z.literal("")),
  template: z
    .string()
    .trim()
    .min(1, "Ingresá el mensaje de la campaña")
    .max(4096, "El mensaje no puede superar los 4096 caracteres"),
  templateD3: z
    .string()
    .trim()
    .max(4096, "El mensaje no puede superar los 4096 caracteres")
    .optional()
    .or(z.literal("")),
  templateD180: z
    .string()
    .trim()
    .max(4096, "El mensaje no puede superar los 4096 caracteres")
    .optional()
    .or(z.literal("")),
  templateD365: z
    .string()
    .trim()
    .max(4096, "El mensaje no puede superar los 4096 caracteres")
    .optional()
    .or(z.literal("")),
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
      warrantyExpiresFrom: z.string().optional().or(z.literal("")),
      warrantyExpiresTo: z.string().optional().or(z.literal("")),
      warrantyMonths: z
        .union([
          z.literal(12),
          z.literal(15),
          z.literal(18),
          z.literal(24),
        ])
        .optional(),
    })
    .partial()
    .optional(),
});

export type CampaignFormValues = z.output<typeof campaignSchema>;

export const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Ingresá el código del producto")
    .max(50, "El código no puede superar los 50 caracteres"),
  name: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre del producto")
    .max(200, "El nombre no puede superar los 200 caracteres"),
  category: z
    .string()
    .trim()
    .max(100, "La categoría no puede superar los 100 caracteres")
    .optional()
    .or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type ProductFormValues = z.output<typeof productSchema>;
export type ProductFormInput = z.input<typeof productSchema>;

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

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

export const AUTOMATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  SCHEDULED: "Programada",
  EXECUTED: "Ejecutada",
  CANCELLED: "Cancelada",
  ERROR: "Error",
  PAUSED: "Pausada",
};

export const COMMERCIAL_CYCLE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

export const IMPORT_TYPE_LABELS: Record<string, string> = {
  CUSTOMERS: "Clientes",
  PRODUCTS: "Productos",
  PURCHASES: "Compras",
};

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  VALIDATING: "Validando",
  PROCESSING: "Procesando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  PARTIAL: "Con errores",
  CANCELLED: "Cancelada",
};

export const ACTIVE_IMPORT_STATUSES = new Set([
  "PENDING",
  "VALIDATING",
  "PROCESSING",
]);

export const followUpSequenceStageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre de la etapa")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  offsetDays: z
    .number()
    .int("Los días de offset deben ser un número entero")
    .min(-365, "El offset no puede ser menor a -365 días")
    .max(365, "El offset no puede ser mayor a 365 días"),
  template: z
    .string()
    .trim()
    .min(1, "Ingresá el mensaje de la etapa")
    .max(4096, "El mensaje no puede superar los 4096 caracteres"),
});

export type FollowUpSequenceStageFormValues = z.output<typeof followUpSequenceStageSchema>;

export const followUpSequenceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre de la secuencia")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  description: z
    .string()
    .trim()
    .max(1000, "La descripción no puede superar los 1000 caracteres")
    .optional()
    .or(z.literal("")),
  warrantyMonths: z
    .number()
    .int()
    .min(1)
    .max(24)
    .refine((val) => [12, 15, 18, 24].includes(val), {
      message: "La duración de garantía debe ser 12, 15, 18 o 24 meses",
    }),
  stages: z
    .array(followUpSequenceStageSchema)
    .min(1, "Al menos una etapa es requerida"),
});

export type FollowUpSequenceFormValues = z.output<typeof followUpSequenceSchema>;