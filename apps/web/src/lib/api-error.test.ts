import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  SEND_BLOCKED_BY_POLICY,
  SEND_BLOCKED_MESSAGE,
  SEND_BLOCKED_TITLE,
  apiReplyConversation,
  isSendBlockedByPolicy,
} from "@/lib/api";

/**
 * El backend responde los errores de negocio ANIDADOS:
 *   { "error": { "code": "...", "message": "..." } }
 * según `ErrorBody` en `apps/api/src/core/filters/http-exception.filter.ts`.
 *
 * Antes `unwrap` leía `{code, message}` en la raíz, así que ningún código de
 * negocio llegaba al frontend y todo se degradaba a UNKNOWN_ERROR. Estos tests
 * fijan el contrato con el servidor real.
 */
describe("cliente API · códigos de error de negocio", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown) {
    fetchMock.mockResolvedValue({
      status,
      text: async () => JSON.stringify(body),
      headers: new Headers(),
    } as unknown as Response);
  }

  it("extrae el código del cuerpo anidado (SEND_BLOCKED_BY_POLICY)", async () => {
    respond(503, {
      error: {
        code: SEND_BLOCKED_BY_POLICY,
        message: "El envío de mensajes está deshabilitado temporalmente.",
      },
    });

    const error = await apiReplyConversation("cou-1", { content: "Hola" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).code).toBe(SEND_BLOCKED_BY_POLICY);
    expect(isSendBlockedByPolicy(error)).toBe(true);
  });

  it("sigue aceptando el formato plano", async () => {
    respond(400, { code: "VALIDATION_ERROR", message: "Contenido inválido" });

    const error = await apiReplyConversation("cou-1", { content: "" }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    expect(isSendBlockedByPolicy(error)).toBe(false);
  });

  it("un 503 que NO es un bloqueo por política no se confunde", async () => {
    respond(503, {
      error: { code: "PROVIDER_UNAVAILABLE", message: "Proveedor caído" },
    });

    const error = await apiReplyConversation("cou-1", { content: "Hola" }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).code).toBe("PROVIDER_UNAVAILABLE");
    // Punto clave: el tratamiento específico NO se aplica a cualquier 503.
    expect(isSendBlockedByPolicy(error)).toBe(false);
  });

  it("cualquier otro código de negocio también llega intacto", async () => {
    respond(404, {
      error: { code: "CONVERSATION_NOT_FOUND", message: "No existe" },
    });

    const error = await apiReplyConversation("no-existe", { content: "Hola" }).catch(
      (e: unknown) => e,
    );

    expect((error as ApiError).code).toBe("CONVERSATION_NOT_FOUND");
  });

  it("un cuerpo inesperado no rompe la construcción del ApiError", async () => {
    respond(500, { loquesea: 1 });

    const error = await apiReplyConversation("cou-1", { content: "Hola" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNKNOWN_ERROR");
    expect(isSendBlockedByPolicy(error)).toBe(false);
  });

  it("isSendBlockedByPolicy ignora errores que no son ApiError", () => {
    expect(isSendBlockedByPolicy(new Error("red caída"))).toBe(false);
    expect(isSendBlockedByPolicy(null)).toBe(false);
    expect(isSendBlockedByPolicy(undefined)).toBe(false);
    expect(isSendBlockedByPolicy("SEND_BLOCKED_BY_POLICY")).toBe(false);
  });

  it("el aviso al asesor dice que NO se envió y no pide reintentar", () => {
    expect(SEND_BLOCKED_TITLE).toBe("Envío bloqueado");
    expect(SEND_BLOCKED_MESSAGE).toMatch(/no se envió/i);
    expect(SEND_BLOCKED_MESSAGE).toMatch(/contacta al administrador/i);
    expect(SEND_BLOCKED_MESSAGE).not.toMatch(/inténtalo|reintent|Inténtalo/);
    // No expone nombres de variables de entorno ni trazas internas.
    expect(SEND_BLOCKED_MESSAGE).not.toMatch(
      /OUTBOUND_|SendPermitGuard|stack|trace/i,
    );
  });
});