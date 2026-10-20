import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatTime,
  PRESENTATION_TIME_ZONE,
} from "./format";

/**
 * Presentación determinista de fechas (RNF-07 / T-D4).
 *
 * Antes estas funciones dependían de la zona horaria del navegador. Ahora la
 * zona es explícita, así que el mismo instante produce siempre la misma fecha
 * civil independientemente de dónde se abra la pantalla.
 */

describe("formatDate", () => {
  it("usa America/Bogota como zona de presentación", () => {
    expect(PRESENTATION_TIME_ZONE).toBe("America/Bogota");
  });

  it("muestra el día civil en Bogotá para un instante a medianoche UTC", () => {
    // 2026-01-31T00:00Z es 2026-01-30 19:00 en Bogotá: debe verse el 30.
    expect(formatDate("2026-01-31T00:00:00.000Z")).toBe("30 ene 2026");
  });

  it("conserva el día cuando el instante cae dentro del día en Bogotá", () => {
    expect(formatDate("2026-01-15T12:00:00.000Z")).toBe("15 ene 2026");
  });

  it("resuelve el cambio de mes y de año", () => {
    expect(formatDate("2026-03-31T00:00:00.000Z")).toBe("30 mar 2026");
    expect(formatDate("2026-12-31T00:00:00.000Z")).toBe("30 dic 2026");
    expect(formatDate("2027-01-01T00:00:00.000Z")).toBe("31 dic 2026");
  });

  it("acepta un offset explícito", () => {
    expect(formatDate("2026-01-15T12:00:00-05:00")).toBe("15 ene 2026");
  });

  it("devuelve el guion largo para valores nulos, vacíos o inválidos", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("no-es-una-fecha")).toBe("—");
  });

  it("mantiene el formato de dos dígitos que usa la interfaz", () => {
    expect(formatDate("2026-01-05T12:00:00.000Z")).toBe("05 ene 2026");
  });
});

describe("formatDateTime", () => {
  it("muestra fecha y hora en Bogotá", () => {
    expect(formatDateTime("2026-01-15T12:00:00.000Z")).toBe(
      "15 ene 2026, 07:00",
    );
  });

  it("corrige el día cuando el instante cae en la tarde previa en Bogotá", () => {
    expect(formatDateTime("2026-01-31T02:00:00.000Z")).toBe(
      "30 ene 2026, 21:00",
    );
  });

  it("devuelve el guion largo para entradas no válidas", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("invalido")).toBe("—");
  });
});

describe("formatTime", () => {
  it("muestra la hora en Bogotá", () => {
    expect(formatTime("2026-01-15T12:00:00.000Z")).toBe("07:00");
  });

  it("usa reloj de 24 horas sin AM/PM", () => {
    expect(formatTime("2026-01-15T20:00:00.000Z")).toBe("15:00");
    expect(formatTime("2026-01-15T23:30:00.000Z")).toBe("18:30");
  });

  it("devuelve el guion largo para entradas no válidas", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("invalido")).toBe("—");
  });
});

describe("independencia de la zona horaria del proceso", () => {
  const samples = [
    "2026-01-31T00:00:00.000Z",
    "2026-01-15T12:00:00.000Z",
    "2026-03-31T00:00:00.000Z",
    "2026-12-31T00:00:00.000Z",
    "2026-07-04T23:30:00.000Z",
  ];

  it("produce el mismo resultado para un conjunto de instantes", () => {
    // Snapshot explícito: si la zona deja de ser explícita, esta lista cambia
    // según la máquina que ejecuta la suite.
    expect(samples.map(formatDate)).toEqual([
      "30 ene 2026",
      "15 ene 2026",
      "30 mar 2026",
      "30 dic 2026",
      "04 jul 2026",
    ]);
  });
});
