import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetCampaign: vi.fn(),
    apiListAutomations: vi.fn(),
    apiPreviewCampaignSegment: vi.fn(),
  };
});

import { CampaignDetailView } from "@/components/campaigns/campaign-detail";
import { apiGetCampaign, apiListAutomations } from "@/lib/api";

const campaign = {
  uuid: "camp-1",
  name: "Campaña Demo — Garantía 12 meses",
  description: "Seguimiento por garantía",
  type: "REPURCHASE",
  status: "ACTIVE",
  startAt: null,
  segment: { warrantyMonths: 12 },
  automationCount: 412,
  executedCount: 12,
  template: "Hola {customerName}",
  updatedAt: "2026-08-22T10:00:00.000Z",
  followUpSequence: {
    uuid: "seq-1",
    name: "Secuencia Demo — Garantía 12 meses",
    warrantyMonths: 12,
    stageCount: 4,
  },
};

const automation = {
  uuid: "a-1",
  status: "SCHEDULED",
  scheduledDate: "2027-01-01T00:00:00.000Z",
  executedDate: null,
  priority: 0,
  purchaseId: "pu-1",
  commercialCycleId: "cc-1",
  createdAt: "2026-08-01T10:00:00.000Z",
};

describe("CampaignDetailView", () => {
  beforeEach(() => {
    vi.mocked(apiGetCampaign).mockReset();
    vi.mocked(apiListAutomations).mockReset();
  });

  it("muestra datos de la campaña y su secuencia vinculada", async () => {
    vi.mocked(apiGetCampaign).mockResolvedValue(campaign as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [automation], meta: { page: 1, limit: 50, total: 1, pages: 1 } } as never);

    render(<CampaignDetailView uuid="camp-1" />);

    await waitFor(() => expect(screen.getByText("Campaña Demo — Garantía 12 meses")).toBeTruthy());
    expect(screen.getByText("Secuencia Demo — Garantía 12 meses")).toBeTruthy();
    expect(screen.getByText(/412 totales/)).toBeTruthy();
    expect(screen.getByText("Programada")).toBeTruthy();
  });

  it("consulta las automatizaciones filtrando por campaignId", async () => {
    vi.mocked(apiGetCampaign).mockResolvedValue(campaign as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, pages: 0 } } as never);

    render(<CampaignDetailView uuid="camp-1" />);

    await waitFor(() => expect(apiGetCampaign).toHaveBeenCalledWith("camp-1"));
    expect(apiListAutomations).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp-1", limit: 50 }),
    );
  });

  it("muestra sin secuencia cuando la campaña no tiene una", async () => {
    vi.mocked(apiGetCampaign).mockResolvedValue({
      ...campaign,
      followUpSequence: null,
    } as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, pages: 0 } } as never);

    render(<CampaignDetailView uuid="camp-1" />);

    await waitFor(() => expect(screen.getByText("Sin secuencia")).toBeTruthy());
  });
});