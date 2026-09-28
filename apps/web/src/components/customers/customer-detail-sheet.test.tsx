import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/conversations",
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGetCustomer: vi.fn(),
    apiListConversations: vi.fn(),
    apiListPurchases: vi.fn(),
  };
});

import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import {
  apiGetCustomer,
  apiListConversations,
  apiListPurchases,
} from "@/lib/api";

const customer = {
  id: "cu-1",
  uuid: "cust-uuid-1",
  codcli: "CLI-1",
  name: "Carlos Mendoza",
  phone: "573001234567",
  email: "carlos@cliente.test",
  city: "Barranquilla",
  status: "ACTIVE",
} as never;

const purchase = {
  uuid: "pu-1",
  purchaseDate: "2026-01-15T12:00:00.000Z",
  value: "150000",
  warrantyExpiresAt: "2027-01-15T12:00:00.000Z",
  product: { name: "Batería Extrema 850" },
} as never;

describe("CustomerDetailSheet: ficha rápida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGetCustomer).mockResolvedValue(customer);
    vi.mocked(apiListPurchases).mockResolvedValue({
      data: [purchase],
      meta: { page: 1, limit: 100, total: 1, pages: 1 },
    } as never);
    vi.mocked(apiListConversations).mockResolvedValue([] as never);
  });

  it("carga contacto y resumen al abrir", async () => {
    render(
      <CustomerDetailSheet
        customerUuid="cust-uuid-1"
        open
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Carlos Mendoza")).toBeTruthy(),
    );
    expect(screen.getByText("Barranquilla")).toBeTruthy();
    expect(screen.getByText("carlos@cliente.test")).toBeTruthy();
    expect(screen.getByText("Batería Extrema 850")).toBeTruthy();
    expect(apiListPurchases).toHaveBeenCalledWith({
      customerId: "cu-1",
      limit: 100,
    });
  });

  it("cuenta las compras con el total del servidor, no con la página", async () => {
    // Server total above the fetched page: the counter must not be capped.
    vi.mocked(apiListPurchases).mockResolvedValue({
      data: [purchase],
      meta: { page: 1, limit: 100, total: 143, pages: 2 },
    } as never);

    render(
      <CustomerDetailSheet
        customerUuid="cust-uuid-1"
        open
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText("143")).toBeTruthy());
    expect(screen.getByText(/Total invertido \(últimas 1\)/)).toBeTruthy();
  });

  it("no ofrece el enlace a conversación si el cliente no tiene ninguna", async () => {
    render(
      <CustomerDetailSheet
        customerUuid="cust-uuid-1"
        open
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Carlos Mendoza")).toBeTruthy(),
    );
    expect(screen.queryByText("Conversación")).toBeNull();
  });

  it("enlaza a la conversación existente", async () => {
    vi.mocked(apiListConversations).mockResolvedValue([
      { uuid: "conv-1" },
    ] as never);

    render(
      <CustomerDetailSheet
        customerUuid="cust-uuid-1"
        open
        onOpenChange={() => {}}
      />,
    );

    const link = await waitFor(() => screen.getByText("Conversación"));
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "/conversations/conv-1",
    );
  });

  it("no pide datos mientras el sheet está cerrado", () => {
    render(
      <CustomerDetailSheet
        customerUuid="cust-uuid-1"
        open={false}
        onOpenChange={() => {}}
      />,
    );

    expect(apiGetCustomer).not.toHaveBeenCalled();
  });
});
