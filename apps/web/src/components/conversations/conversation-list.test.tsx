import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListConversations: vi.fn() };
});

import { useConversations } from "@/components/conversations/conversation-list";
import { apiListConversations } from "@/lib/api";

const items = [
  {
    uuid: "c1",
    customerId: "cust-1",
    status: "OPEN",
    messageCount: 1,
    lastMessageAt: null,
    tags: [],
    advisor: null,
  },
] as never;

describe("useConversations: filtro assignedOnly", () => {
  beforeEach(() => {
    vi.mocked(apiListConversations).mockReset();
  });

  it("toggle OFF (false) → el parámetro assigned NO se envía", async () => {
    vi.mocked(apiListConversations).mockResolvedValue(items);

    renderHook(() => useConversations({ status: undefined, assigned: false }, 0));

    await waitFor(() => expect(apiListConversations).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListConversations).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 50 });
    expect(params).not.toHaveProperty("assigned");
  });

  it("sin filtro (assigned undefined) → el parámetro assigned NO se envía", async () => {
    vi.mocked(apiListConversations).mockResolvedValue(items);

    renderHook(() => useConversations({ status: "OPEN", assigned: undefined }, 0));

    await waitFor(() => expect(apiListConversations).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListConversations).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 50, status: "OPEN" });
    expect(params).not.toHaveProperty("assigned");
  });

  it("toggle ON (true) → se envía assigned=true", async () => {
    vi.mocked(apiListConversations).mockResolvedValue(items);

    renderHook(() => useConversations({ assigned: true }, 0));

    await waitFor(() => expect(apiListConversations).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListConversations).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 50, assigned: "true" });
  });

  it("toggle OFF no oculta conversaciones: los items recibidos se exponen", async () => {
    vi.mocked(apiListConversations).mockResolvedValue(items);

    const { result } = renderHook(() => useConversations({ assigned: false }, 0));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });
});