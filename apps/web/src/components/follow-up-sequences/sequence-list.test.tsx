import { render, screen, waitFor, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiListFollowUpSequences: vi.fn(),
    apiDeleteFollowUpSequence: vi.fn(),
  };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useAuth } from "@/components/auth/auth-provider";
import {
  SequenceList,
  useFollowUpSequences,
  type SequenceFilters,
} from "@/components/follow-up-sequences/sequence-list";
import { ApiError, apiDeleteFollowUpSequence, apiListFollowUpSequences } from "@/lib/api";
import { toast } from "sonner";

const adminUser = {
  id: "id-1",
  uuid: "u1",
  firstName: "Ana",
  lastName: "García",
  email: "ana@automatize.test",
  role: "ADMINISTRADOR",
  accountType: "ORGANIZATION",
  organizationId: "org-1",
  status: "ACTIVE",
} as const;

const operadorUser = { ...adminUser, role: "OPERADOR" } as const;

function sequence(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "fus-1",
    name: "Garantía 12 meses",
    description: "Secuencia base",
    warrantyMonths: 12 as const,
    stageCount: 3,
    createdAt: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

const payload = {
  data: [sequence()],
  meta: { page: 1, limit: 20, total: 42, pages: 3 },
};

describe("useFollowUpSequences: filtros", () => {
  beforeEach(() => {
    vi.mocked(apiListFollowUpSequences).mockReset();
  });

  it("sin filtros → page 1 y limit 20", async () => {
    vi.mocked(apiListFollowUpSequences).mockResolvedValue(payload as never);

    renderHook(() => useFollowUpSequences({}));

    await waitFor(() => expect(apiListFollowUpSequences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListFollowUpSequences).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it("search se recorta antes de enviarse", async () => {
    vi.mocked(apiListFollowUpSequences).mockResolvedValue(payload as never);

    const filters: SequenceFilters = { search: "  garantia  " };
    renderHook(() => useFollowUpSequences(filters));

    await waitFor(() => expect(apiListFollowUpSequences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListFollowUpSequences).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      search: "garantia",
    });
  });

  it("warrantyMonths se envía como filtro exacto", async () => {
    vi.mocked(apiListFollowUpSequences).mockResolvedValue(payload as never);

    renderHook(() => useFollowUpSequences({ warrantyMonths: 24 }));

    await waitFor(() => expect(apiListFollowUpSequences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiListFollowUpSequences).mock.calls[0][0]).toEqual({
      page: 1,
      limit: 20,
      warrantyMonths: 24,
    });
  });

  it("expone items y meta sin error", async () => {
    vi.mocked(apiListFollowUpSequences).mockResolvedValue(payload as never);

    const { result } = renderHook(() => useFollowUpSequences({}));

    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toEqual({ page: 1, limit: 20, pages: 3, total: 42 });
    expect(result.current.error).toBeNull();
  });

  it("error 401 no setea error (manejado por la sesión)", async () => {
    vi.mocked(apiListFollowUpSequences).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", "Sesión expirada"),
    );

    const { result } = renderHook(() => useFollowUpSequences({}));

    await waitFor(() => expect(apiListFollowUpSequences).toHaveBeenCalledTimes(1));
    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("error genérico setea mensaje y vacía items", async () => {
    vi.mocked(apiListFollowUpSequences).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useFollowUpSequences({}));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("No se pudieron cargar");
    expect(result.current.items).toEqual([]);
  });
});

describe("SequenceList: estados de render", () => {
  beforeEach(() => {
    vi.mocked(apiListFollowUpSequences).mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: adminUser,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
    } as never);
  });

  it("items null → muestra esqueleto de carga", () => {
    render(
      <SequenceList items={null} error={null} onChanged={() => {}} onSelect={() => {}} onEdit={() => {}} />,
    );
    expect(screen.getByLabelText("Cargando secuencias")).toBeInTheDocument();
  });

  it("error → muestra estado de error con el mensaje", () => {
    render(
      <SequenceList
        items={[]}
        error="No se pudieron cargar las secuencias."
        onChanged={() => {}}
        onSelect={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("Error al cargar")).toBeInTheDocument();
    expect(screen.getByText(/No se pudieron cargar/)).toBeInTheDocument();
  });

  it("sin items → muestra estado vacío", () => {
    render(
      <SequenceList items={[]} error={null} onChanged={() => {}} onSelect={() => {}} onEdit={() => {}} />,
    );
    expect(screen.getByText("Sin secuencias")).toBeInTheDocument();
  });

  it("con items → muestra nombre, meses y etapas; el click en la fila selecciona", async () => {
    const onSelect = vi.fn();
    render(
      <SequenceList
        items={[sequence()]}
        error={null}
        onChanged={() => {}}
        onSelect={onSelect}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Garantía 12 meses")).toBeInTheDocument();
    expect(screen.getByText("12 meses")).toBeInTheDocument();
    expect(screen.getByText(/3 etapas/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Ver detalle de la secuencia/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ uuid: "fus-1" }));
  });
});

describe("SequenceActions: roles y eliminación (HG-FUS-01)", () => {
  beforeEach(() => {
    vi.mocked(apiListFollowUpSequences).mockReset();
    vi.mocked(apiDeleteFollowUpSequence).mockReset();
    vi.clearAllMocks();
  });

  it("ADMINISTRADOR ve acciones y puede eliminar con confirmación", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: adminUser,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
    } as never);
    vi.mocked(apiDeleteFollowUpSequence).mockResolvedValue({
      uuid: "fus-1",
      success: true,
    } as never);
    const onChanged = vi.fn();

    render(
      <SequenceList
        items={[sequence()]}
        error={null}
        onChanged={onChanged}
        onSelect={() => {}}
        onEdit={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Acciones de secuencia" }));
    await userEvent.click(await screen.findByText("Eliminar"));
    await userEvent.click(await screen.findByText("Confirmar eliminación"));

    await waitFor(() =>
      expect(apiDeleteFollowUpSequence).toHaveBeenCalledWith("fus-1"),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Secuencia eliminada");
  });

  it("OPERADOR no ve acciones (hidden, no disabled)", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: operadorUser,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
    } as never);

    render(
      <SequenceList
        items={[sequence()]}
        error={null}
        onChanged={() => {}}
        onSelect={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Acciones de secuencia" }),
    ).not.toBeInTheDocument();
  });
});