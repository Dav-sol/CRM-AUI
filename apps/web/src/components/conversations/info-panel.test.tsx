import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConversationInfoPanel } from "@/components/conversations/info-panel";

const props = {
  status: "OPEN" as const,
  customerId: "cust-1",
  advisorName: null,
  activeTags: [] as { uuid: string; name: string; color: string | null }[],
  allTags: [
    { uuid: "t1", name: "Postventa", color: "#16a34a", conversationCount: 1, createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z" },
    { uuid: "t2", name: "Interesado", color: "#2563eb", conversationCount: 1, createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z" },
  ],
  notes: [] as never[],
  onToggleTag: vi.fn().mockResolvedValue(undefined),
  onAddNote: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn().mockResolvedValue(undefined),
  onArchive: vi.fn().mockResolvedValue(undefined),
  onReopen: vi.fn().mockResolvedValue(undefined),
};

describe("ConversationInfoPanel: triggers sin botones anidados", () => {
  it("no anida botones en tooltip/popovers", () => {
    const { container } = render(<ConversationInfoPanel {...props} />);
    expect(container.querySelectorAll("button button")).toHaveLength(0);
  });

  it("el popover de etiquetas abre y lista las etiquetas", async () => {
    const userEv = userEvent.setup();
    render(<ConversationInfoPanel {...props} />);

    await userEv.click(screen.getByRole("button", { name: "Administrar etiquetas" }));
    expect(await screen.findByText("Postventa")).toBeVisible();
    expect(screen.getByText("Interesado")).toBeVisible();
  });

  it("el botón Asignar está deshabilitado (gap de usuarios)", () => {
    render(<ConversationInfoPanel {...props} />);
    expect(screen.getByRole("button", { name: "Asignar asesor" })).toBeDisabled();
  });
});