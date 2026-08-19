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