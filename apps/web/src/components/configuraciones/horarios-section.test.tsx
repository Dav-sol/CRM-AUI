import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetConfigHorarios: vi.fn(),
    apiUpdateConfigHorarios: vi.fn(),
  };
});

import { HorariosSection } from "@/components/configuraciones/horarios-section";
import {
  ApiError,
  apiGetConfigHorarios,
  apiUpdateConfigHorarios,
} from "@/lib/api";

const horarios = {
  businessHoursEnabled: false,
  timezone: "America/Bogota",
  businessDays: ["MON", "TUE", "WED", "THU", "FRI"] as (
    "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
  )[],
  businessHoursStart: null,
  businessHoursEnd: null,
};

const mockedGet = vi.mocked(apiGetConfigHorarios);
const mockedUpdate = vi.mocked(apiUpdateConfigHorarios);

describe("HorariosSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(horarios as never);
    mockedUpdate.mockImplementation((body) =>
      Promise.resolve({ ...horarios, ...body } as never),
    );
  });

  it("un tenant sin configurar viene con el horario desactivado", async () => {
    render(<HorariosSection />);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Restringir los envíos/,
    });
    expect(checkbox).not.toBeChecked();
    // Desactivado: la ventana no es editable, no se ofrece una falsa ventana.
    expect(screen.getByLabelText("Desde")).toBeDisabled();
    expect(screen.getByLabelText("Hasta")).toBeDisabled();
    expect(screen.getByLabelText("Zona horaria")).toBeDisabled();
  });

  it("convierte la hora a minutos desde medianoche al guardar", async () => {
    mockedGet.mockResolvedValue({
      ...horarios,
      businessHoursEnabled: true,
      businessHoursStart: 540,
      businessHoursEnd: 1020,
    } as never);
    render(<HorariosSection />);

    // 09:00 / 17:00 -> 540 / 1020
    expect(await screen.findByLabelText("Desde")).toHaveValue("09:00");
    expect(screen.getByLabelText("Hasta")).toHaveValue("17:00");

    await userEvent.clear(screen.getByLabelText("Desde"));
    await userEvent.type(screen.getByLabelText("Desde"), "08:00");
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar horario/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({
        businessHoursEnabled: true,
        timezone: "America/Bogota",
        businessDays: ["MON", "TUE", "WED", "THU", "FRI"],
        businessHoursStart: 480,
        businessHoursEnd: 1020,
      });
    });
    expect(await screen.findByText("Horario guardado.")).toBeInTheDocument();
  });

  it("limpiar la ventana envía null en inicio y fin", async () => {
    mockedGet.mockResolvedValue({
      ...horarios,
      businessHoursEnabled: true,
      businessHoursStart: 480,
      businessHoursEnd: 1080,
    } as never);
    render(<HorariosSection />);

    await userEvent.clear(await screen.findByLabelText("Desde"));
    await userEvent.clear(screen.getByLabelText("Hasta"));
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar horario/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          businessHoursStart: null,
          businessHoursEnd: null,
        }),
      );
    });
  });

  it("alternar un día lo quita de la lista enviada", async () => {
    mockedGet.mockResolvedValue({
      ...horarios,
      businessHoursEnabled: true,
      businessDays: ["MON", "TUE"],
    } as never);
    render(<HorariosSection />);

    await userEvent.click(await screen.findByRole("button", { name: /Lunes/ }));
    await userEvent.click(screen.getByRole("button", { name: /Sábado/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar horario/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ businessDays: ["TUE", "SAT"] }),
      );
    });
  });

  it("no envía nada si no hay cambios", async () => {
    render(<HorariosSection />);

    expect(
      await screen.findByRole("button", { name: /Guardar horario/ }),
    ).toBeDisabled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("muestra el mensaje del ApiError sin perder el formulario", async () => {
    mockedUpdate.mockRejectedValue(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "La hora de inicio y la de fin no pueden ser iguales",
      ),
    );
    mockedGet.mockResolvedValue({
      ...horarios,
      businessHoursEnabled: true,
      businessHoursStart: 480,
    } as never);
    render(<HorariosSection />);

    // Un cambio real habilita el guardado; el rechazo del servidor no borra el valor.
    await userEvent.click(
      await screen.findByRole("button", { name: /Sábado/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar horario/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La hora de inicio y la de fin no pueden ser iguales",
    );
    expect(screen.getByLabelText("Desde")).toHaveValue("08:00");
  });
});
