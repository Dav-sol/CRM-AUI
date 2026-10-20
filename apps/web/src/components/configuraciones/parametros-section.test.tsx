import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetConfigParametros: vi.fn(),
    apiUpdateConfigParametros: vi.fn(),
  };
});

import { ParametrosSection } from "@/components/configuraciones/parametros-section";
import {
  ApiError,
  apiGetConfigParametros,
  apiUpdateConfigParametros,
} from "@/lib/api";

type Parametros = Awaited<ReturnType<typeof apiGetConfigParametros>>;

function parametros(
  overrides: Partial<Record<string, unknown>> = {},
): Parametros {
  return {
    maxCommercialPer60d: { valor: 3, source: "env" },
    minDaysBetweenCommercial: { valor: 3, source: "env" },
    quoteExpiryDays: { valor: 7, source: "env" },
    whatsappMessageCost: { valor: 200, source: "env" },
    whatsappMessageCostCommercial: { valor: 400, source: "default" },
    smsCostPerSegment: { valor: 100, source: "default" },
    smsCurrency: { valor: "COP", source: "env" },
    ...overrides,
  } as Parametros;
}

const mockedGet = vi.mocked(apiGetConfigParametros);
const mockedUpdate = vi.mocked(apiUpdateConfigParametros);

describe("ParametrosSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(parametros());
    // Tras guardar, el backend responde con esos valores ya en BD (source: db).
    mockedUpdate.mockImplementation((body) =>
      Promise.resolve(
        parametros(
          Object.fromEntries(
            Object.entries(body).map(([key, value]) => [
              key,
              { valor: value, source: "db" },
            ]),
          ),
        ),
      ),
    );
  });

  it("muestra el valor efectivo y su origen", async () => {
    render(<ParametrosSection />);

    expect(
      await screen.findByLabelText("Máximo de mensajes comerciales en 60 días"),
    ).toHaveValue("3");
    expect(screen.getAllByText("Del servidor").length).toBeGreaterThan(0);
    // El default del código se distingue del valor heredado del servidor.
    expect(
      screen.getByLabelText("Costo estimado WhatsApp (comercial)"),
    ).toHaveValue("400");
    // smsCostPerSegment también lo resuelve el default del código.
    expect(screen.getAllByText("Por defecto")).toHaveLength(2);
  });

  it("envía solo los campos modificados (PATCH parcial)", async () => {
    render(<ParametrosSection />);

    const quoteExpiry = await screen.findByLabelText(
      "Días de vigencia de una cotización",
    );
    await userEvent.clear(quoteExpiry);
    await userEvent.type(quoteExpiry, "21");

    await userEvent.click(
      screen.getByRole("button", { name: /Guardar parámetros/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ quoteExpiryDays: 21 });
    });
  });

  it("envía la moneda en mayúsculas", async () => {
    render(<ParametrosSection />);

    const currency = await screen.findByLabelText(
      "Moneda de los costos estimados",
    );
    await userEvent.clear(currency);
    await userEvent.type(currency, "usd");

    await userEvent.click(
      screen.getByRole("button", { name: /Guardar parámetros/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({ smsCurrency: "USD" });
    });
  });

  it("rechaza un valor no numérico antes de llamar a la API", async () => {
    render(<ParametrosSection />);

    const cost = await screen.findByLabelText(
      "Costo estimado WhatsApp (no comercial)",
    );
    await userEvent.clear(cost);
    await userEvent.type(cost, "abc");

    await userEvent.click(
      screen.getByRole("button", { name: /Guardar parámetros/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "debe ser un número",
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("no habilita el guardado sin cambios", async () => {
    render(<ParametrosSection />);

    expect(
      await screen.findByRole("button", { name: /Guardar parámetros/ }),
    ).toBeDisabled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("tras guardar, el origen pasa a Configurado", async () => {
    render(<ParametrosSection />);

    const quoteExpiry = await screen.findByLabelText(
      "Días de vigencia de una cotización",
    );
    await userEvent.clear(quoteExpiry);
    await userEvent.type(quoteExpiry, "21");
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar parámetros/ }),
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText("Días de vigencia de una cotización"),
      ).toHaveValue("21");
    });
    expect(
      await screen.findByText("Parámetros guardados."),
    ).toBeInTheDocument();
  });

  it("muestra el error del servidor", async () => {
    mockedUpdate.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "El valor es fuera de rango"),
    );
    render(<ParametrosSection />);

    const quoteExpiry = await screen.findByLabelText(
      "Días de vigencia de una cotización",
    );
    await userEvent.clear(quoteExpiry);
    await userEvent.type(quoteExpiry, "9999");
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar parámetros/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El valor es fuera de rango",
    );
  });
});
