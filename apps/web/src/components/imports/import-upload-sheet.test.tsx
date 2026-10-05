import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiCreateImportJob: vi.fn() };
});

import { ImportUploadSheet } from "@/components/imports/import-upload-sheet";
import { apiCreateImportJob } from "@/lib/api";

const CHECKBOX_LABEL = "Usar la fecha de compra como fecha de instalación";

function archivo(): File {
  return new File(["x"], "compras.csv", { type: "text/csv" });
}

/** Abre el panel y devuelve los helpers de uso. */
async function abrirSheet(
  tipo: "CUSTOMERS" | "PRODUCTS" | "PURCHASES" = "PURCHASES",
) {
  const user = await import("@testing-library/user-event");
  render(<ImportUploadSheet />);
  await user.default.setup();
  fireEvent.click(screen.getByRole("button", { name: /Importar archivo/ }));
  const select = await screen.findByLabelText("Tipo de datos");
  fireEvent.change(select, { target: { value: tipo } });
  return user.default;
}

/** Selecciona el fichero en el input de archivo. */
function elegirArchivo() {
  const input = screen.getByLabelText("Archivo") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [archivo()] } });
}

const checkbox = () =>
  screen.queryByLabelText(CHECKBOX_LABEL) as HTMLInputElement | null;

beforeEach(() => {
  vi.mocked(apiCreateImportJob).mockReset();
  vi.mocked(apiCreateImportJob).mockResolvedValue({
    uuid: "job-1",
    type: "PURCHASES",
    status: "PENDING",
    fileName: "compras.csv",
    totalRecords: 0,
    processedRecords: 0,
    errorRecords: 0,
    errorsSummary: { total: 0, samples: [] },
    startedAt: null,
    completedAt: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
  } as unknown as Awaited<ReturnType<typeof apiCreateImportJob>>);
});

describe("ImportUploadSheet: la fecha de instalación solo aparece en compras", () => {
  it("PURCHASES: la opción está disponible", async () => {
    await abrirSheet("PURCHASES");
    expect(checkbox()).not.toBeNull();
  });

  it("CUSTOMERS: la opción NO aparece", async () => {
    await abrirSheet("CUSTOMERS");
    expect(checkbox()).toBeNull();
  });

  it("PRODUCTS: la opción NO aparece", async () => {
    await abrirSheet("PRODUCTS");
    expect(checkbox()).toBeNull();
  });

  it("la opción se desmarca sola al cambiar a clientes", async () => {
    await abrirSheet("PURCHASES");
    fireEvent.click(checkbox()!);
    expect(checkbox()!.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Tipo de datos"), {
      target: { value: "CUSTOMERS" },
    });

    fireEvent.change(screen.getByLabelText("Tipo de datos"), {
      target: { value: "PURCHASES" },
    });
    // Vuelve a ser visible pero desmarcada: no sobrevive marcada.
    expect(checkbox()!.checked).toBe(false);
  });
});

describe("ImportUploadSheet: desmarcado por defecto y envío del valor", () => {
  it("está desmarcada por defecto y la importación no pide confirmación", async () => {
    await abrirSheet("PURCHASES");
    elegirArchivo();

    expect(checkbox()!.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));

    await waitFor(() => expect(apiCreateImportJob).toHaveBeenCalledTimes(1));
    expect(apiCreateImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ installationFromPurchaseDate: false }),
    );
    expect(screen.queryByText("Confirmar fecha de instalación")).toBeNull();
  });

  it("marcada: pide confirmación antes de subir nada", async () => {
    await abrirSheet("PURCHASES");
    elegirArchivo();
    fireEvent.click(checkbox()!);

    fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));

    expect(
      await screen.findByText("Confirmar fecha de instalación"),
    ).toBeTruthy();
    // Nada se ha subido todavía.
    expect(apiCreateImportJob).not.toHaveBeenCalled();
  });

  it("Confirmar: envía installationFromPurchaseDate true", async () => {
    await abrirSheet("PURCHASES");
    elegirArchivo();
    fireEvent.click(checkbox()!);
    fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(apiCreateImportJob).toHaveBeenCalledTimes(1));
    expect(apiCreateImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PURCHASES",
        installationFromPurchaseDate: true,
      }),
    );
  });

  it("Cancelar: no importa y devuelve al formulario sin bloquearlo", async () => {
    await abrirSheet("PURCHASES");
    elegirArchivo();
    fireEvent.click(checkbox()!);
    fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));

    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    // No se subió nada y el formulario sigue operativo.
    expect(apiCreateImportJob).not.toHaveBeenCalled();
    expect(screen.queryByText("Confirmar fecha de instalación")).toBeNull();
    expect(screen.getByRole("button", { name: "Subir archivo" })).toBeTruthy();

    // Y el flujo normal sigue funcionando después de cancelar.
    fireEvent.click(checkbox()!); // desmarcar
    fireEvent.click(screen.getByRole("button", { name: "Subir archivo" }));
    await waitFor(() => expect(apiCreateImportJob).toHaveBeenCalledTimes(1));
    expect(apiCreateImportJob).toHaveBeenCalledWith(
      expect.objectContaining({ installationFromPurchaseDate: false }),
    );
  });
});
