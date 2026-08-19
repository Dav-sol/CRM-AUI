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
import { apiListQuickReplies } from "@/lib/api";
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
      "No se pudo enviar el mensaje. Intentalo nuevamente.",
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