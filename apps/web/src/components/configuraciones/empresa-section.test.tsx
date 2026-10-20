import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetMiEmpresa: vi.fn(),
    apiUpdateMiEmpresa: vi.fn(),
  };
});

import { EmpresaSection } from "@/components/configuraciones/empresa-section";
import { ApiError, apiGetMiEmpresa, apiUpdateMiEmpresa } from "@/lib/api";

const organization = {
  id: "org-1",
  uuid: "uu-1",
  name: "Baterías del Caribe",
  slug: "baterias-del-caribe",
  nit: "900123456-7",
  email: null,
  phone: null,
  city: null,
  status: "ACTIVE",
  createdAt: "2026-09-27T13:57:41.157Z",
  updatedAt: "2026-09-27T13:57:41.157Z",
  deletedAt: null,
};

const mockedGet = vi.mocked(apiGetMiEmpresa);
const mockedUpdate = vi.mocked(apiUpdateMiEmpresa);

describe("EmpresaSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue(organization as never);
    mockedUpdate.mockImplementation((body) =>
      Promise.resolve({ ...organization, ...body } as never),
    );
  });

  it("carga los datos de la empresa del servidor", async () => {
    render(<EmpresaSection />);

    await waitFor(() => {
      expect(screen.getByLabelText("Nombre")).toHaveValue(
        "Baterías del Caribe",
      );
    });
    expect(screen.getByLabelText("NIT")).toHaveValue("900123456-7");
    // Los null del servidor se muestran como campo vacío, no como "null".
    expect(screen.getByLabelText("Correo")).toHaveValue("");
  });

  it("guarda solo cuando hay cambios", async () => {
    render(<EmpresaSection />);

    const guardar = await screen.findByRole("button", {
      name: /Guardar cambios/,
    });
    expect(guardar).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Ciudad"), "Barranquilla");
    expect(guardar).toBeEnabled();
    expect(screen.getByText("Hay cambios sin guardar")).toBeInTheDocument();
  });

  it("envía solo los campos editables y confirma", async () => {
    render(<EmpresaSection />);

    await screen.findByDisplayValue("Baterías del Caribe");
    await userEvent.clear(screen.getByLabelText("Ciudad"));
    await userEvent.type(screen.getByLabelText("Ciudad"), "Cali");

    await userEvent.click(
      screen.getByRole("button", { name: /Guardar cambios/ }),
    );

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith({
        name: "Baterías del Caribe",
        nit: "900123456-7",
        email: null,
        phone: null,
        city: "Cali",
      });
    });
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("muestra el mensaje del ApiError sin perder lo escrito", async () => {
    mockedUpdate.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "El correo no es válido"),
    );
    render(<EmpresaSection />);

    await screen.findByDisplayValue("Baterías del Caribe");
    await userEvent.type(screen.getByLabelText("Ciudad"), "Cali");
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar cambios/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El correo no es válido",
    );
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Cali");
  });

  it("un fallo inesperado muestra el texto genérico", async () => {
    mockedUpdate.mockRejectedValue(new Error("boom"));
    render(<EmpresaSection />);

    await screen.findByDisplayValue("Baterías del Caribe");
    await userEvent.type(screen.getByLabelText("Ciudad"), "Cali");
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar cambios/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron guardar los datos de la empresa.",
    );
  });
});
