import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListCampaigns: vi.fn() };
});

import { useCampaigns } from "@/components/campaigns/campaign-list";
import { apiListCampaigns } from "@/lib/api";

const payload = {
  data: [
    {
      uuid: "camp-1",
      name: "Recompra verano",
      description: null,
      type: "REPURCHASE",
      status: "DRAFT",
      startAt: null,
      segment: null,
      automationCount: 0,
      executedCount: 0,
      createdAt: "2026-08-13T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useCampaigns: filtros de búsqueda", () => {
  beforeEach(() => {
    vi.mocked(apiListCampaigns).mockReset();
  });

  it("sin filtros → page 1 y limit 20", async () => {
    vi.mocked(apiListCampaigns).mockResolvedValue(payload as never);

    renderHook(() => useCampaigns({}));

    await waitFor(() => expect(apiListCampaigns).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListCampaigns).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con search y status → ambos se envían", async () => {
    vi.mocked(apiListCampaigns).mockResolvedValue(payload as never);

    renderHook(() => useCampaigns({ search: "recompra", status: "ACTIVE" }));

    await waitFor(() => expect(apiListCampaigns).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListCampaigns).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      search: "recompra",
      status: "ACTIVE",
    });
  });

  it("status undefined → NO se envía el parámetro status", async () => {
    vi.mocked(apiListCampaigns).mockResolvedValue(payload as never);

    renderHook(() => useCampaigns({ status: undefined }));

    await waitFor(() => expect(apiListCampaigns).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListCampaigns).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(params).not.toHaveProperty("status");
  });

  it("expone items y meta", async () => {
    vi.mocked(apiListCampaigns).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useCampaigns({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });
});