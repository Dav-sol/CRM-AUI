import { describe, expect, it } from "vitest";

import { formatCivilDate, formatCivilDateTime } from "./format";

/**
 * Fechas civiles (`purchaseDate`, `warrantyExpiresAt`, `installationDate`).
 *
 * Son columnas `DATE`: el día es el que registró el negocio. Aplicar la zona
 * operativa las desplazaría un día hacia atrás, porque llegan a las 00:00 UTC.
 */

describe("formatCivilDate", () => {
  it("muestra exactamente el día almacenado", () => {
    expect(formatCivilDate("2026-01-15T00:00:00.000Z")).toBe("15 ene 2026");
    expect(formatCivilDate("2026-01-31T00:00:00.000Z")).toBe("31 ene 2026");
    expect(formatCivilDate("2028-02-29T00:00:00.000Z")).toBe("29 feb 2028");
  });

  it("no desplaza el día que caería en la zona operativa", () => {
    // Este valor, formateado con America/Bogota, mostraría "30 ene 2026".
    expect(formatCivilDate("2026-01-31T00:00:00.000Z")).not.toBe("30 ene 2026");
  });

  it("acepta también la forma YYYY-MM-DD", () => {
    expect(formatCivilDate("2026-01-31")).toBe("31 ene 2026");
  });

  it("devuelve el guion largo para nulos e inválidos", () => {
    expect(formatCivilDate(null)).toBe("—");
    expect(formatCivilDate(undefined)).toBe("—");
    expect(formatCivilDate("")).toBe("—");
    expect(formatCivilDate("invalido")).toBe("—");
  });
});

describe("formatCivilDateTime", () => {
  it("muestra el día civil con su hora", () => {
    expect(formatCivilDateTime("2026-01-15T12:00:00.000Z")).toBe(
      "15 ene 2026, 12:00",
    );
  });

  it("mantiene el día civil a medianoche UTC", () => {
    expect(formatCivilDateTime("2026-12-31T00:00:00.000Z")).toBe(
      "31 dic 2026, 00:00",
    );
  });

  it("devuelve el guion largo para nulos e inválidos", () => {
    expect(formatCivilDateTime(null)).toBe("—");
    expect(formatCivilDateTime("invalido")).toBe("—");
  });
});