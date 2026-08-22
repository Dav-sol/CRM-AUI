import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiCreateFollowUpSequence: vi.fn(),
    apiGetFollowUpSequence: vi.fn(),
    apiUpdateFollowUpSequence: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  CreateSequenceSheet,
  EditSequenceSheet,
} from "@/components/follow-up-sequences/sequence-sheet";
import {
  ApiError,
  apiCreateFollowUpSequence,
  apiGetFollowUpSequence,
  apiUpdateFollowUpSequence,
} from "@/lib/api";
import { toast } from "sonner";

const detail = {
  uuid: "fus-1",
  name: "Garantía 12 meses",
  description: "Secuencia base",
  warrantyMonths: 12,
  stageCount: 2,
  createdAt: "2026-08-13T10:00:00.000Z",
  updatedAt: "2026-08-14T10:00:00.000Z",
  stages: [
    {
      uuid: "st-1",
      name: "Día 0",
      anchor: "WARRANTY_EXPIRY",
      offsetDays: -360,
      template: "Hola",
      templateOnPast: null,
      createdAt: "2026-08-13T10:00:00.000Z",
    },
    {
      uuid: "st-2",
      name: "Renovación",
      anchor: "WARRANTY_EXPIRY",
      offsetDays: -30,
      template: "Plan Retorno",
      templateOnPast: "Oferta de recompra",
      createdAt: "2026-08-13T10:00:00.000Z",
    },
  ],
};

describe("CreateSequenceSheet", () => {
  beforeEach(() => {
    vi.mocked(apiCreateFollowUpSequence).mockReset();
  });

  it("valida campos requeridos y no llama a la API", async () => {
    render(<CreateSequenceSheet />);

    await userEvent.click(
      screen.getByRole("button", { name: /Nueva secuencia/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Crear secuencia" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/Ingresá el nombre/).length).toBeGreaterThan(
        0,
      ),
    );
    expect(apiCreateFollowUpSequence).not.toHaveBeenCalled();
  });

  it("crea la secuencia con etapas y refresca al terminar", async () => {
    const onCreated = vi.fn();
    vi.mocked(apiCreateFollowUpSequence).mockResolvedValue({
      uuid: "fus-new",
      name: "Nueva",
      organizationId: "org-1",
      createdAt: "2026-08-21T00:00:00.000Z",
    } as never);

    render(<CreateSequenceSheet onCreated={onCreated} />);
    await userEvent.click(
      screen.getByRole("button", { name: /Nueva secuencia/ }),
    );

    // Placeholder único para el nombre de la secuencia
    await userEvent.type(
      screen.getByPlaceholderText("Seguimiento garantía 12 meses"),
      "Nueva",
    );
    // getAllByLabelText("Nombre")[1] selecciona el input de la etapa 1 (el [0] es el nombre principal)
    await userEvent.type(
      screen.getAllByLabelText("Nombre", { exact: true })[1],
      "Día 0",
    );
    // getAllByLabelText("Mensaje")[0] selecciona la plantilla de la etapa 1
    const templateInput = screen.getAllByLabelText("Mensaje", {
      exact: true,
    })[0];
    fireEvent.change(templateInput, {
      target: { value: "Hola {customerName}" },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Crear secuencia" }),
    );

    await waitFor(() =>
      expect(apiCreateFollowUpSequence).toHaveBeenCalledTimes(1),
    );
    expect(vi.mocked(apiCreateFollowUpSequence).mock.calls[0][0]).toMatchObject(
      {
        name: "Nueva",
        warrantyMonths: 12,
        stages: [
          {
            name: "Día 0",
            anchor: "PURCHASE_DATE",
            offsetDays: 0,
            template: "Hola {customerName}",
          },
        ],
      },
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "Secuencia creada correctamente",
    );
  });

  it("error de API muestra el mensaje del servidor", async () => {
    vi.mocked(apiCreateFollowUpSequence).mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Duplicate offsetDays: -30"),
    );
    render(<CreateSequenceSheet />);

    await userEvent.click(
      screen.getByRole("button", { name: /Nueva secuencia/ }),
    );

    // Usar placeholder único para el nombre de la secuencia
    await userEvent.type(
      screen.getByPlaceholderText("Seguimiento garantía 12 meses"),
      "X",
    );
    // getAllByLabelText("Nombre")[1] selecciona el input de la etapa 1 (el [0] es el nombre principal)
    await userEvent.type(
      screen.getAllByLabelText("Nombre", { exact: true })[1],
      "A",
    );
    // getAllByLabelText("Mensaje")[0] selecciona la plantilla de la etapa 1
    await userEvent.type(
      screen.getAllByLabelText("Mensaje", { exact: true })[0],
      "t",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Crear secuencia" }),
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/Duplicate offsetDays/);
    expect(toast.error).toHaveBeenCalledWith("No se pudo crear la secuencia");
  });
});

describe("EditSequenceSheet", () => {
  beforeEach(() => {
    vi.mocked(apiGetFollowUpSequence).mockReset();
    vi.mocked(apiUpdateFollowUpSequence).mockReset();
  });

  it("precarga los datos de la secuencia y guarda el reemplazo completo", async () => {
    vi.mocked(apiGetFollowUpSequence).mockResolvedValue(detail as never);
    vi.mocked(apiUpdateFollowUpSequence).mockResolvedValue({
      uuid: "fus-1",
      name: "Garantía 12 meses",
    } as never);
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <EditSequenceSheet uuid="fus-1" onClose={onClose} onSaved={onSaved} />,
    );

    // Esperar a que desaparezca el estado de carga
    await waitFor(() =>
      expect(screen.queryByText("Cargando…")).not.toBeInTheDocument(),
    );

    // Precarga: buscar el input por placeholder (más robusto que label en portal Radix)
    const nameInput = await screen.findByPlaceholderText(
      "Seguimiento garantía 12 meses",
    );
    await waitFor(() => expect(nameInput).toHaveValue("Garantía 12 meses"));
    expect(apiGetFollowUpSequence).toHaveBeenCalledWith("fus-1");

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Garantía 12 meses v2");

    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );

    await waitFor(() =>
      expect(apiUpdateFollowUpSequence).toHaveBeenCalledTimes(1),
    );
    const [calledUuid, body] = vi.mocked(apiUpdateFollowUpSequence).mock
      .calls[0];
    expect(calledUuid).toBe("fus-1");
    expect(body).toMatchObject({
      name: "Garantía 12 meses v2",
      warrantyMonths: 12,
      stages: [
        {
          name: "Día 0",
          anchor: "WARRANTY_EXPIRY",
          offsetDays: -360,
          template: "Hola",
        },
        {
          name: "Renovación",
          anchor: "WARRANTY_EXPIRY",
          offsetDays: -30,
          template: "Plan Retorno",
        },
      ],
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("muestra error de carga cuando el detalle falla", async () => {
    vi.mocked(apiGetFollowUpSequence).mockRejectedValue(new Error("boom"));

    render(<EditSequenceSheet uuid="fus-x" onClose={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByText("No se pudo cargar la secuencia."),
      ).toBeInTheDocument(),
    );
  });

  it("uuid null → sheet cerrado, sin llamadas", () => {
    render(<EditSequenceSheet uuid={null} onClose={() => {}} />);
    expect(apiGetFollowUpSequence).not.toHaveBeenCalled();
  });
});
