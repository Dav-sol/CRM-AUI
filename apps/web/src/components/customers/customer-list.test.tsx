import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListCustomers: vi.fn() };
});

import { useCustomers } from "@/components/customers/customer-list";
import { ApiError, apiListCustomers } from "@/lib/api";

const payload = {
  data: [
    {
      id: "c1",
      uuid: "u1",
      codcli: "C-0001",
      name: "Juan Pérez",
      phone: "0991234567",
      email: null,
      city: "Quito",
      status: "ACTIVE",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useCustomers: búsqueda y paginación", () => {
  beforeEach(() => {
    vi.mocked(apiListCustomers).mockReset();
  });

  it("sin filtros → page 1 y limit 20, sin search", async () => {
    vi.mocked(apiListCustomers).mockResolvedValue(payload as never);

    renderHook(() => useCustomers({}));

    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListCustomers).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con search → se envía el término recortado", async () => {
    vi.mocked(apiListCustomers).mockResolvedValue(payload as never);

    renderHook(() => useCustomers({ search: "  juan  " }));

    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListCustomers).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      search: "juan",
    });
  });

  it("search vacío → NO se envía el parámetro search", async () => {
    vi.mocked(apiListCustomers).mockResolvedValue(payload as never);

    renderHook(() => useCustomers({ search: "   " }));

    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    const params = vi.mocked(apiListCustomers).mock.calls[0][0];
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(params).not.toHaveProperty("search");
  });

  it("expone items, meta y sin error", async () => {
    vi.mocked(apiListCustomers).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useCustomers({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });

  it("error 401 no setea error (manejado por la sesión)", async () => {
    vi.mocked(apiListCustomers).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", "Sesión expirada"),
    );

    const { result } = renderHook(() => useCustomers({}));

    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();
  });
});