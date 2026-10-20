import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationDetail, ConversationListItem } from "@/lib/sdk-types";

/**
 * AUTO-SAFETY-008 — contrato de propagación del error de envío.
 *
 * `handleReply` (en `conversations/list-page.tsx`) consumía el error en un
 * `catch` vacío: un bloqueo por política era indistinguible de un acierto y el
 * asesor no recibía ninguna señal. Ahora consume el 401 (que el cliente de API
 * ya gestiona) y re-lanza el resto para que lo muestre el `ReplyBox`.
 *
 * Esta prueba renderiza la página real con las únicas tres funciones de red
 * sustituidas. No hay refactor: se ejercita el componente tal como está.
 * Los fixtures respetan el contrato de `ConversationListItem` /
 * `ConversationDetail` generado por el SDK (incluido `tags`, que
 * `ConversationList` reduce con `item.tags.map(...)`).
 */

const apiMocks = vi.hoisted(() => ({
  apiListConversations: vi.fn(),
  apiGetConversation: vi.fn(),
  apiReplyConversation: vi.fn(),
  apiListQuickReplies: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMocks }));

import { ConversationsIndexPage } from "@/app/(app)/conversations/list-page";
import {
  ApiError,
  SEND_BLOCKED_BY_POLICY,
  SEND_BLOCKED_MESSAGE,
  SEND_BLOCKED_TITLE,
} from "@/lib/api";

const ITEM = {
  uuid: "cou-1",
  channel: "WHATSAPP_CLIENTS",
  id: "co-1",
  status: "OPEN",
  customerId: "cu-1",
  customer: { uuid: "cus-1", name: "Ana Pérez", status: "ACTIVE" },
  advisorId: null,
  advisor: null,
  lastMessageAt: "2026-10-10T10:00:00Z",
  messageCount: 1,
  createdAt: "2026-10-01T10:00:00Z",
  tags: [],
} as unknown as ConversationListItem;

const DETAIL = {
  uuid: "cou-1",
  channel: "WHATSAPP_CLIENTS",
  id: "co-1",
  status: "OPEN",
  customerId: "cu-1",
  customer: { uuid: "cus-1", name: "Ana Pérez", status: "ACTIVE" },
  advisorId: null,
  lastMessageAt: "2026-10-10T10:00:00Z",
  messageCount: 1,
  createdAt: "2026-10-01T10:00:00Z",
  tags: [],
  messages: [],
  notes: [],
} as unknown as ConversationDetail;

const DRAFT = "Hola, ¿cómo estás?";

function blocked(): ApiError {
  return new ApiError(503, SEND_BLOCKED_BY_POLICY, "deshabilitado");
}

/** Selecciona la conversación de la lista, escribe el borrador y envía. */
async function selectAndSend() {
  const user = userEvent.setup();
  render(<ConversationsIndexPage />);

  // `ConversationList` se usa con `compact`, así que cada fila es un <button>.
  const row = await screen.findByRole("button", { name: /Ana Pérez/i });
  await user.click(row);

  const textarea = await screen.findByRole("textbox", { name: "Respuesta" });
  await user.type(textarea, DRAFT);
  await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
  return textarea;
}

describe("handleReply · contrato de propagación", () => {
  beforeEach(() => {
    for (const m of Object.values(apiMocks)) m.mockReset();
    // `useConversations` asigna la respuesta tal cual a `items`.
    apiMocks.apiListConversations.mockResolvedValue([ITEM]);
    apiMocks.apiListQuickReplies.mockResolvedValue([]);
    apiMocks.apiGetConversation.mockResolvedValue(DETAIL);
    toastMocks.error.mockClear();
    toastMocks.success.mockClear();
  });

  it("el bloqueo por política NO se absorbe: llega al aviso del ReplyBox", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(blocked());

    await selectAndSend();

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(SEND_BLOCKED_TITLE, {
        description: SEND_BLOCKED_MESSAGE,
      }),
    );
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });

  it("el error no se transforma en éxito: ni toast de éxito ni recarga", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(blocked());

    const user = userEvent.setup();
    render(<ConversationsIndexPage />);

    // Seleccionar ya carga la conversación una vez; esa es la línea base.
    await user.click(await screen.findByRole("button", { name: /Ana Pérez/i }));
    const textarea = await screen.findByRole("textbox", { name: "Respuesta" });
    await waitFor(() =>
      expect(apiMocks.apiGetConversation).toHaveBeenCalledTimes(1),
    );

    await user.type(textarea, DRAFT);
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(1));
    expect(toastMocks.success).not.toHaveBeenCalled();
    // Tras un envío bloqueado no debe.reload la conversación: si el error se
    // perdiera, `selectConversation` se ejecutaría y el mensaje parecería
    // entregado.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(apiMocks.apiGetConversation).toHaveBeenCalledTimes(1);
  });

  it("el borrador sigue bajo control del asesor tras el bloqueo", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(blocked());

    const textarea = await selectAndSend();

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
    expect(textarea).toHaveValue(DRAFT);
  });

  it("no reintenta automáticamente", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(blocked());

    await selectAndSend();

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(1));
    expect(apiMocks.apiReplyConversation).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(apiMocks.apiReplyConversation).toHaveBeenCalledTimes(1);
  });

  it("un 401 se consume y no se presenta como error de envío", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "Sesión expirada"),
    );

    await selectAndSend();

    await waitFor(() =>
      expect(apiMocks.apiReplyConversation).toHaveBeenCalledTimes(1),
    );
    // `handleReply` consume el 401 a propósito: el cliente de API ya gestiona
    // la sesión expirada. Lo relevante es que no se presente como bloqueo de
    // seguridad ni provoque reintentos.
    expect(toastMocks.error).not.toHaveBeenCalledWith(
      SEND_BLOCKED_TITLE,
      expect.anything(),
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(apiMocks.apiReplyConversation).toHaveBeenCalledTimes(1);
  });

  it("observación: con 401 la promesa se resuelve y ReplyBox limpia el borrador", async () => {
    // Comportamiento PREEXISTENTE, no introducido por este trabajo: la página
    // consume el 401 con `return`, así que ReplyBox ve una promesa resuelta y
    // limpia el textarea. Es coherente con "la sesión terminó", pero implica
    // que ante sesión expirada el asesor pierde el texto. Se documenta en vez
    // de cambiar producción sin decisión de producto.
    apiMocks.apiReplyConversation.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "Sesión expirada"),
    );

    const textarea = await selectAndSend();

    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(toastMocks.error).not.toHaveBeenCalledWith(
      SEND_BLOCKED_TITLE,
      expect.anything(),
    );
  });

  it("un 503 no bloqueado conserva el aviso genérico", async () => {
    apiMocks.apiReplyConversation.mockRejectedValue(
      new ApiError(503, "PROVIDER_UNAVAILABLE", "Proveedor caído"),
    );

    await selectAndSend();

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        "No se pudo enviar el mensaje. Inténtalo nuevamente.",
      ),
    );
  });

  it("un envío exitoso sí recarga y limpia el borrador (control positivo)", async () => {
    apiMocks.apiReplyConversation.mockResolvedValue({ uuid: "msg-1" });

    const textarea = await selectAndSend();

    await waitFor(() => expect(apiMocks.apiGetConversation).toHaveBeenCalled());
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
