import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListImportJobs: vi.fn() };
});

import { useImportJobs } from "@/components/imports/import-list";
import { ApiError, apiListImportJobs } from "@/lib/api";

function job(status: string) {
  return {
    uuid: "u1",
    type: "CUSTOMERS",
    status,
    fileName: "clientes.xlsx",
    totalRecords: 10,
    processedRecords: 10,
    errorRecords: 0,
    errorsSummary: { total: 0, samples: [] },
    startedAt: "2026-08-20T10:00:00.000Z",
    completedAt: null,
    createdAt: "2026-08-20T09:59:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
  };
}

const payload = {
  data: [job("COMPLETED")],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useImportJobs: filtros, paginación y polling", () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(apiListImportJobs).mockReset();
    const realSetInterval = globalThis.setInterval.bind(globalThis);
    setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((callback: (_: void) => void, delay?: number) =>
        realSetInterval(callback, delay ?? 0),
      );
    clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  function pollIntervals(): number[] {
    return setIntervalSpy.mock.calls
      .map((call: unknown[]) => call[1] as number | undefined)
      .filter((delay: number | undefined): delay is number => delay === 4000);
  }

  it("sin filtros → page 1 y limit 20, sin type", async () => {
    vi.mocked(apiListImportJobs).mockResolvedValue(payload as never);

    renderHook(() => useImportJobs({}));

    await waitFor(() => expect(apiListImportJobs).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListImportJobs).mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it("con type → se envía el filtro de tipo", async () => {
    vi.mocked(apiListImportJobs).mockResolvedValue(payload as never);

    renderHook(() => useImportJobs({ type: "PURCHASES" }));

    await waitFor(() => expect(apiListImportJobs).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListImportJobs).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      type: "PURCHASES",
    });
  });

  it("sin jobs activos → NO programa polling", async () => {
    vi.mocked(apiListImportJobs).mockResolvedValue(payload as never);

    renderHook(() => useImportJobs({}));

    await waitFor(() => expect(apiListImportJobs).toHaveBeenCalledTimes(1));
    expect(pollIntervals()).toEqual([]);
  });

  it("con jobs activos → programa polling cada 4s", async () => {
    vi.mocked(apiListImportJobs).mockResolvedValue({
      ...payload,
      data: [job("PROCESSING")],
    } as never);

    renderHook(() => useImportJobs({}));

    await waitFor(() => expect(pollIntervals()).toHaveLength(1));
    expect(pollIntervals()).toEqual([4000]);
  });

  it("expone items, meta y sin error", async () => {
    vi.mocked(apiListImportJobs).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useImportJobs({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });

  it("error 401 no setea error (manejado por la sesión)", async () => {
    vi.mocked(apiListImportJobs).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", "Sesión expirada"),
    );

    const { result } = renderHook(() => useImportJobs({}));

    await waitFor(() => expect(apiListImportJobs).toHaveBeenCalledTimes(1));
    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();
  });
});