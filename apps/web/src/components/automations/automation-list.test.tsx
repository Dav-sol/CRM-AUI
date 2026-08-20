import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListAutomations: vi.fn() };
});

import { useAutomations } from "@/components/automations/automation-list";
import { apiListAutomations } from "@/lib/api";

const payload = {
  data: [
    {
      uuid: "auto-1",
      status: "SCHEDULED",
      scheduledDate: "2026-08-21T10:00:00.000Z",
      executedDate: null,
      priority: 0,
      purchaseId: "purchase-1",
      commercialCycleId: "cycle-1",
      createdAt: "2026-08-20T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useAutomations: filtros", () => {
  beforeEach(() => {
    vi.mocked(apiListAutomations).mockReset();
  });

  it("sin filtros → page 1 y limit 20", async () => {
    vi.mocked(apiListAutomations).mockResolvedValue(payload as never);

    renderHook(() => useAutomations({}));

    await waitFor(() => expect(apiListAutomations).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListAutomations).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con status → se envía", async () => {
    vi.mocked(apiListAutomations).mockResolvedValue(payload as never);

    renderHook(() => useAutomations({ status: "CANCELLED" }));

    await waitFor(() => expect(apiListAutomations).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListAutomations).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      status: "CANCELLED",
    });
  });

  it("status undefined → NO se envía el parámetro", async () => {
    vi.mocked(apiListAutomations).mockResolvedValue(payload as never);

    renderHook(() => useAutomations({ status: undefined }));

    await waitFor(() => expect(apiListAutomations).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListAutomations).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(params).not.toHaveProperty("status");
  });

  it("expone items y meta", async () => {
    vi.mocked(apiListAutomations).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useAutomations({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });
});