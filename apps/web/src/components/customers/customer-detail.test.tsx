import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetCustomer: vi.fn(),
    apiListPurchases: vi.fn(),
    apiListAutomations: vi.fn(),
    apiListConversations: vi.fn(),
  };
});

import { CustomerDetailView } from "@/components/customers/customer-detail";
import { apiGetCustomer, apiListAutomations, apiListConversations, apiListPurchases } from "@/lib/api";

const customer = {
  id: "c-1",
  uuid: "cu-1",
  codcli: "DEMO-0001",
  name: "Carlos Mendoza",
  phone: "+57 300 111 2233",
  email: "carlos.mendoza@example.com",
  city: "Barranquilla",
  status: "ACTIVE",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const purchase = {
  uuid: "p-1",
  invoiceNumber: "F-100",
  purchaseDate: "2026-02-01T00:00:00.000Z",
  quantity: 1,
  value: "300.00",
  status: "COMPLETED",
  warrantyMonths: 12,
  warrantyExpiresAt: "2027-02-01T00:00:00.000Z",
  customer: { id: "c-1", codcli: "DEMO-0001", name: "Carlos Mendoza" },
  product: { id: "pr-1", code: "WIL-1", name: "Batería Extrema 850" },
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

const conversation = {
  uuid: "cv-1",
  channel: "WHATSAPP_CLIENTS",
  status: "OPEN",
  customerId: "c-1",
  advisorId: null,
  lastMessageAt: "2026-08-01T10:00:00.000Z",
  messageCount: 3,
  createdAt: "2026-08-01T10:00:00.000Z",
};

describe("CustomerDetailView", () => {
  beforeEach(() => {
    vi.mocked(apiGetCustomer).mockReset();
    vi.mocked(apiListPurchases).mockReset();
    vi.mocked(apiListAutomations).mockReset();
    vi.mocked(apiListConversations).mockReset();
  });

  it("muestra datos del cliente, compras con garantía, automatizaciones y conversaciones", async () => {
    vi.mocked(apiGetCustomer).mockResolvedValue(customer as never);
    vi.mocked(apiListPurchases).mockResolvedValue({ data: [purchase], meta: { page: 1, limit: 100, total: 1, pages: 1 } } as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [automation], meta: { page: 1, limit: 50, total: 1, pages: 1 } } as never);
    vi.mocked(apiListConversations).mockResolvedValue([conversation] as never);

    render(<CustomerDetailView uuid="cu-1" />);

    await waitFor(() => expect(screen.getByText("Carlos Mendoza")).toBeTruthy());
    expect(screen.getByText("Barranquilla")).toBeTruthy();
    expect(screen.getByText("Batería Extrema 850")).toBeTruthy();
    expect(screen.getByText(/12 meses · vence/)).toBeTruthy();
    expect(screen.getAllByText("Programada").length).toBeGreaterThan(0);
  });

  it("filtra compras por el id interno del cliente y automatizaciones por uuid", async () => {
    vi.mocked(apiGetCustomer).mockResolvedValue(customer as never);
    vi.mocked(apiListPurchases).mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0, pages: 0 } } as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, pages: 0 } } as never);
    vi.mocked(apiListConversations).mockResolvedValue([] as never);

    render(<CustomerDetailView uuid="cu-1" />);

    await waitFor(() => expect(apiGetCustomer).toHaveBeenCalledWith("cu-1"));
    await waitFor(() =>
      expect(apiListPurchases).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c-1", limit: 100 })),
    );
    expect(apiListAutomations).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cu-1", limit: 50 }));
    expect(apiListConversations).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cu-1", limit: 50 }));
  });

  it("muestra estado vacío cuando no hay compras", async () => {
    vi.mocked(apiGetCustomer).mockResolvedValue(customer as never);
    vi.mocked(apiListPurchases).mockResolvedValue({ data: [], meta: { page: 1, limit: 100, total: 0, pages: 0 } } as never);
    vi.mocked(apiListAutomations).mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, pages: 0 } } as never);
    vi.mocked(apiListConversations).mockResolvedValue([] as never);

    render(<CustomerDetailView uuid="cu-1" />);

    await waitFor(() => expect(screen.getByText("Sin compras")).toBeTruthy());
  });
});