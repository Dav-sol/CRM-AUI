import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListPurchases: vi.fn() };
});

import { usePurchases } from "@/components/purchases/purchase-list";
import { apiListPurchases } from "@/lib/api";

const payload = {
  data: [
    {
      id: "p1",
      uuid: "pu1",
      invoiceNumber: "INV-0001",
      purchaseDate: "2026-07-22T14:35:18Z",
      quantity: 2,
      value: "450.00",
      status: "COMPLETED",
      customer: { id: "c1", codcli: "C-0001", name: "Juan Pérez" },
      product: { id: "pr1", code: "P-100", name: "Batería X" },
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("usePurchases: filtros de búsqueda", () => {
  beforeEach(() => {
    vi.mocked(apiListPurchases).mockReset();
  });

  it("sin filtros → page 1 y limit 20", async () => {
    vi.mocked(apiListPurchases).mockResolvedValue(payload as never);

    renderHook(() => usePurchases({}));

    await waitFor(() => expect(apiListPurchases).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListPurchases).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con search y status → ambos se envían", async () => {
    vi.mocked(apiListPurchases).mockResolvedValue(payload as never);

    renderHook(() => usePurchases({ search: "INV", status: "CANCELLED" }));

    await waitFor(() => expect(apiListPurchases).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListPurchases).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      search: "INV",
      status: "CANCELLED",
    });
  });

  it("status undefined → NO se envía el parámetro status", async () => {
    vi.mocked(apiListPurchases).mockResolvedValue(payload as never);

    renderHook(() => usePurchases({ status: undefined }));

    await waitFor(() => expect(apiListPurchases).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListPurchases).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(params).not.toHaveProperty("status");
  });

  it("expone items y meta", async () => {
    vi.mocked(apiListPurchases).mockResolvedValue(payload as never);

    const { result } = renderHook(() => usePurchases({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });
});