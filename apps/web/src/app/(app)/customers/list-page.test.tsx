import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  search: { toString: () => "" } as { toString: () => string },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navMocks.replace, push: navMocks.push }),
  useSearchParams: () => navMocks.search,
  usePathname: () => "/customers",
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "user-1",
      uuid: "u1",
      firstName: "Ana",
      lastName: "García",
      email: "ana@automatize.test",
      role: "ADMINISTRADOR",
      accountType: "ORGANIZATION",
      organizationId: "org-1",
      status: "ACTIVE",
    },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiListCustomers: vi.fn() };
});

import { CustomersIndexPage } from "@/app/(app)/customers/list-page";
import { GlobalFilter } from "@/components/filters/global-filter";
import { FilterProvider } from "@/lib/filter-provider";
import { apiListCustomers } from "@/lib/api";

const payload = {
  data: [
    {
      id: "c1",
      uuid: "u1",
      codcli: "C-0001",
      name: "Juan Pérez",
      phone: "0991234567",
      email: null,
      city: "Barranquilla",
      status: "ACTIVE",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
    },
  ],
  meta: { page: 1, limit: 20, total: 6, pages: 1 },
};

function listCalls() {
  return customerCalls().map((call) => call[0]);
}

function customerCalls() {
  return (apiListCustomers as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
}

function lastUrl(): string | undefined {
  const calls = navMocks.replace.mock.calls;
  return calls.length > 0 ? (calls[calls.length - 1][0] as string) : undefined;
}

function renderScreen() {
  return render(
    <FilterProvider>
      <GlobalFilter />
      <CustomersIndexPage />
    </FilterProvider>,
  );
}

async function openPanel(userEventRef: ReturnType<typeof userEvent.setup>) {
  await userEventRef.click(screen.getByRole("button", { name: /Filtros/ }));
  await waitFor(() => expect(screen.getByLabelText(/Ciudad/)).toBeTruthy());
}

describe("Clientes + filtro global: borrador y aplicación (FR-005)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    navMocks.search = { toString: () => "" };
    vi.mocked(apiListCustomers).mockResolvedValue(payload as never);
  });

  it("escribir la ciudad no dispara consultas ni escribe la URL", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    const before = customerCalls().length;
    const replacesBefore = navMocks.replace.mock.calls.length;

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");

    expect(apiListCustomers).toHaveBeenCalledTimes(before);
    expect(navMocks.replace.mock.calls.length).toBe(replacesBefore);
    expect(listCalls()[before - 1]).not.toHaveProperty("city");
  });

  it("la URL refleja solo lo aplicado, nunca el borrador", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Por vencer" }),
    );
    // Draft only: nothing about it reached the URL.
    expect(lastUrl() ?? "").not.toContain("city=");
    expect(lastUrl() ?? "").not.toContain("warrantyStatus=");

    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() => expect(lastUrl()).toBeDefined());
    const url = lastUrl() ?? "";
    expect(url).toContain("city=Barranquilla");
    expect(url).toContain("warrantyStatus=expiring");
    // "all" is the default and never reaches the URL.
    expect(url).not.toContain("warrantyStatus=all");
  });

  it("limpiar quita las claves de la URL", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );
    await waitFor(() => expect(lastUrl()).toContain("city=Barranquilla"));
    // The router mock now reflects the URL the hook just wrote.
    navMocks.search = { toString: () => "city=Barranquilla" };

    await openPanel(userEventRef);
    await userEventRef.click(
      screen.getByRole("button", { name: "Limpiar filtros" }),
    );

    await waitFor(() => expect(lastUrl()).toBe("/customers"));
  });

  it("aplicar la ciudad hace exactamente una consulta con el parámetro", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    const before = customerCalls().length;

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() =>
      expect(apiListCustomers).toHaveBeenCalledTimes(before + 1),
    );
    expect(listCalls().at(-1)).toMatchObject({ city: "Barranquilla" });
  });

  it("el badge no cuenta el borrador y sí lo aplicado", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("global-filter-count")).toBeNull();

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Por vencer" }),
    );
    // Still nothing applied.
    expect(screen.queryByTestId("global-filter-count")).toBeNull();

    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("global-filter-count").textContent).toBe("2"),
    );
  });

  it("cerrar sin aplicar descarta el borrador y no consulta", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    const before = customerCalls().length;

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Cartagena");
    await userEventRef.click(screen.getByRole("button", { name: "Filtros" })); // cerrar
    await waitFor(() => expect(screen.queryByLabelText(/Ciudad/)).toBeNull());

    expect(apiListCustomers).toHaveBeenCalledTimes(before);
    expect(screen.queryByTestId("global-filter-count")).toBeNull();

    // Reopening shows the applied value (empty), not the discarded draft.
    await openPanel(userEventRef);
    expect((screen.getByLabelText(/Ciudad/) as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("los filtros aplicados sobreviven a cerrar y reabrir el panel", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("global-filter-count").textContent).toBe("1"),
    );

    await openPanel(userEventRef);
    expect((screen.getByLabelText(/Ciudad/) as HTMLInputElement).value).toBe(
      "Barranquilla",
    );
  });

  it("el estado de garantía aplica su ventana en la consulta", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));

    await openPanel(userEventRef);
    await userEventRef.click(
      screen.getByRole("button", { name: "Por vencer" }),
    );
    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() =>
      expect(listCalls().at(-1)).toMatchObject({ warrantyExpiringInDays: 30 }),
    );
  });

  it("las fechas aplican el rango en la consulta", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));
    const before = customerCalls().length;

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText("Desde"), "2026-01-01");
    expect(apiListCustomers).toHaveBeenCalledTimes(before);

    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );

    await waitFor(() =>
      expect(listCalls().at(-1)).toMatchObject({ createdFrom: "2026-01-01" }),
    );
  });

  it("limpiar deja la lista sin filtros y el badge a 0", async () => {
    const userEventRef = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(apiListCustomers).toHaveBeenCalledTimes(1));

    await openPanel(userEventRef);
    await userEventRef.type(screen.getByLabelText(/Ciudad/), "Barranquilla");
    await userEventRef.click(
      screen.getByRole("button", { name: "Aplicar filtros" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("global-filter-count").textContent).toBe("1"),
    );
    const before = customerCalls().length;

    await openPanel(userEventRef);
    await userEventRef.click(
      screen.getByRole("button", { name: "Limpiar filtros" }),
    );

    await waitFor(() =>
      expect(apiListCustomers).toHaveBeenCalledTimes(before + 1),
    );
    expect(listCalls().at(-1)).not.toHaveProperty("city");
    expect(screen.queryByTestId("global-filter-count")).toBeNull();
  });
});
