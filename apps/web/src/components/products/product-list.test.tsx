import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListProducts: vi.fn() };
});

import { useProducts } from "@/components/products/product-list";
import { ApiError, apiListProducts } from "@/lib/api";

const payload = {
  data: [
    {
      id: "p1",
      uuid: "u1",
      code: "P-100",
      name: "Batería X",
      category: "Baterías",
      status: "ACTIVE",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useProducts: búsqueda, estado y paginación", () => {
  beforeEach(() => {
    vi.mocked(apiListProducts).mockReset();
  });

  it("sin filtros → page 1 y limit 20, sin search", async () => {
    vi.mocked(apiListProducts).mockResolvedValue(payload as never);

    renderHook(() => useProducts({}));

    await waitFor(() => expect(apiListProducts).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListProducts).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con search → se envía el término recortado", async () => {
    vi.mocked(apiListProducts).mockResolvedValue(payload as never);

    renderHook(() => useProducts({ search: "  bateria  " }));

    await waitFor(() => expect(apiListProducts).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListProducts).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      search: "bateria",
    });
  });

  it("search vacío → NO se envía el parámetro search", async () => {
    vi.mocked(apiListProducts).mockResolvedValue(payload as never);

    renderHook(() => useProducts({ search: "   " }));

    await waitFor(() => expect(apiListProducts).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListProducts).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(params).not.toHaveProperty("search");
  });

  it("con status → se envía el filtro de estado", async () => {
    vi.mocked(apiListProducts).mockResolvedValue(payload as never);

    renderHook(() => useProducts({ status: "INACTIVE" }));

    await waitFor(() => expect(apiListProducts).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListProducts).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      status: "INACTIVE",
    });
  });

  it("expone items, meta y sin error", async () => {
    vi.mocked(apiListProducts).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useProducts({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });

  it("error 401 no setea error (manejado por la sesión)", async () => {
    vi.mocked(apiListProducts).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", "Sesión expirada"),
    );

    const { result } = renderHook(() => useProducts({}));

    await waitFor(() => expect(apiListProducts).toHaveBeenCalledTimes(1));
    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();
  });
});