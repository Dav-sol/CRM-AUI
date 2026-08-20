import { describe, expect, it } from "vitest";

import { campaignSchema } from "@/lib/validators";

describe("campaignSchema: segmento y campos obligatorios", () => {
  it("rechaza sin nombre", () => {
    const result = campaignSchema.safeParse({
      name: "",
      type: "AUTOMATIC",
      template: "Hola {customerName}",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("name"))).toBe(true);
    }
  });

  it("rechaza sin template", () => {
    const result = campaignSchema.safeParse({
      name: "Campaña",
      type: "MANUAL",
      template: "",
    });
    expect(result.success).toBe(false);
  });

  it("acepta campos mínimos (name + type + template)", () => {
    const result = campaignSchema.safeParse({
      name: "Recompra",
      type: "REPURCHASE",
      template: "Hola {customerName}",
    });
    expect(result.success).toBe(true);
  });

  it("acepta segmento vacío (se omite en el payload)", () => {
    const result = campaignSchema.safeParse({
      name: "Recompra",
      type: "AUTOMATIC",
      template: "Hola",
      segment: { city: "", productId: "", purchaseFrom: "", purchaseTo: "", customerStatus: "" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta segmento con al menos un criterio", () => {
    const result = campaignSchema.safeParse({
      name: "Recompra",
      type: "AUTOMATIC",
      template: "Hola",
      segment: { city: "Quito" },
    });
    expect(result.success).toBe(true);
  });

  it("acepta segmento ausente", () => {
    const result = campaignSchema.safeParse({
      name: "Recompra",
      type: "AUTOMATIC",
      template: "Hola",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza template mayor a 4096", () => {
    const result = campaignSchema.safeParse({
      name: "Recompra",
      type: "AUTOMATIC",
      template: "x".repeat(4097),
    });
    expect(result.success).toBe(false);
  });
});