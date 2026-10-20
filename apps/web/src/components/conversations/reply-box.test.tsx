import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListQuickReplies: vi.fn() };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { ReplyBox } from "@/components/conversations/reply-box";
import {
  ApiError,
  SEND_BLOCKED_BY_POLICY,
  SEND_BLOCKED_MESSAGE,
  SEND_BLOCKED_TITLE,
  apiListQuickReplies,
} from "@/lib/api";
import { toast } from "sonner";

describe("ReplyBox: feedback de error al enviar", () => {
  beforeEach(() => {
    vi.mocked(apiListQuickReplies).mockReset();
    vi.mocked(apiListQuickReplies).mockResolvedValue([]);
    vi.mocked(toast.error).mockClear();
  });

  it("no anida botones en el trigger de respuestas rápidas", async () => {
    const { container } = render(<ReplyBox onSend={vi.fn()} />);

    await waitFor(() => expect(apiListQuickReplies).toHaveBeenCalledTimes(1));
    expect(container.querySelectorAll("button button")).toHaveLength(0);
  });

  it("fallo del provider → toast de error + sin unhandled rejection + conserva el texto", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("provider: no entregado"));
    const user = userEvent.setup();
    render(<ReplyBox onSend={onSend} />);

    await waitFor(() => expect(apiListQuickReplies).toHaveBeenCalledTimes(1));

    const textarea = screen.getByRole("textbox", { name: "Respuesta" });
    await user.type(textarea, "Hola cliente");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "No se pudo enviar el mensaje. Inténtalo nuevamente.",
    );
    expect(textarea).toHaveValue("Hola cliente");
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled();
  });

  it("éxito → limpia el textarea y NO muestra toast de error", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReplyBox onSend={onSend} />);

    await waitFor(() => expect(apiListQuickReplies).toHaveBeenCalledTimes(1));

    const textarea = screen.getByRole("textbox", { name: "Respuesta" });
    await user.type(textarea, "Hola cliente");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });
});

/**
 * AUTO-SAFETY-005 — la política de seguridad de salida puede rechazar el envío
 * con HTTP 503 y el código `SEND_BLOCKED_BY_POLICY`. El asesor debe entender
 * que el mensaje NO se envió, conservar su texto y no recibir un aviso que le
 * invite a reintentar en bucle.
 */
describe("ReplyBox: bloqueo por política de seguridad", () => {
  beforeEach(() => {
    vi.mocked(apiListQuickReplies).mockReset();
    vi.mocked(apiListQuickReplies).mockResolvedValue([]);
    vi.mocked(toast.error).mockClear();
  });

  type OnSend = (content: string, quickReplyId?: string) => Promise<void>;

  async function typeAndSend(onSend: OnSend) {
    const user = userEvent.setup();
    render(<ReplyBox onSend={onSend} />);
    await waitFor(() => expect(apiListQuickReplies).toHaveBeenCalledTimes(1));

    const textarea = screen.getByRole("textbox", { name: "Respuesta" });
    await user.type(textarea, "Hola, ¿cómo estás?");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    return textarea;
  }

  function blockedError() {
    return new ApiError(
      503,
      SEND_BLOCKED_BY_POLICY,
      "El envío de mensajes está deshabilitado temporalmente.",
    );
  }

  it("muestra el aviso de envío bloqueado, no un error genérico", async () => {
    const onSend = vi.fn<OnSend>().mockRejectedValue(blockedError());

    await typeAndSend(onSend);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(SEND_BLOCKED_TITLE, {
        description: SEND_BLOCKED_MESSAGE,
      }),
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
    // El texto histórico "Inténtalo nuevamente" no debe aparecer: un reintento
    // volvería a ser bloqueado por la misma política.
    expect(toast.error).not.toHaveBeenCalledWith(
      "No se pudo enviar el mensaje. Inténtalo nuevamente.",
    );
  });

  it("conserva el borrador del asesor", async () => {
    const onSend = vi.fn<OnSend>().mockRejectedValue(blockedError());

    const textarea = await typeAndSend(onSend);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(textarea).toHaveValue("Hola, ¿cómo estás?");
  });

  it("no reintenta automáticamente", async () => {
    const onSend = vi.fn<OnSend>().mockRejectedValue(blockedError());

    await typeAndSend(onSend);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Un solo intento: ningún bucle, ninguna ruta alternativa.
    expect(onSend).toHaveBeenCalledTimes(1);
    // El botón vuelve a estar disponible, pero no se pulsa solo.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("no muestra ninguna notificación de éxito", async () => {
    const onSend = vi.fn<OnSend>().mockRejectedValue(blockedError());

    await typeAndSend(onSend);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledTimes(1);
    // Ninguna notificación de éxito: el mock de sonner no expone `success`,
    // así que su ausencia es la garantía de que el componente no lo invoca.
    expect(toast).not.toHaveProperty("success");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("un 503 que NO es un bloqueo conserva el aviso genérico", async () => {
    const onSend = vi
      .fn<OnSend>()
      .mockRejectedValue(new ApiError(503, "PROVIDER_UNAVAILABLE", "Caído"));

    const textarea = await typeAndSend(onSend);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo enviar el mensaje. Inténtalo nuevamente.",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      SEND_BLOCKED_TITLE,
      expect.anything(),
    );
    expect(textarea).toHaveValue("Hola, ¿cómo estás?");
  });

  it("los errores de red mantienen su aviso genérico", async () => {
    const onSend = vi
      .fn<OnSend>()
      .mockRejectedValue(new Error("Failed to fetch"));

    await typeAndSend(onSend);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "No se pudo enviar el mensaje. Inténtalo nuevamente.",
      ),
    );
  });

  it("un rechazo con formato inesperado no rompe el renderizado", async () => {
    const onSend = vi.fn<OnSend>().mockRejectedValue("cadena inesperada");

    const textarea = await typeAndSend(onSend);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(textarea).toHaveValue("Hola, ¿cómo estás?");
    // Sigue operable: un segundo intento manual es posible.
    expect(screen.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled();
  });
});