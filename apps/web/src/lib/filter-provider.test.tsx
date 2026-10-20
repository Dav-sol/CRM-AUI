import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/components/auth/auth-provider";
import {
  DEFAULT_FILTERS,
  FilterProvider,
  filterScopeOf,
  useFilters,
  WARRANTY_EXPIRED_IN_DAYS,
  WARRANTY_EXPIRING_IN_DAYS,
} from "@/lib/filter-provider";
import type { LoginUser } from "@/lib/sdk-types";

const user: LoginUser = {
  id: "user-1",
  uuid: "u1",
  firstName: "Ana",
  lastName: "García",
  email: "ana@automatize.test",
  role: "ADMINISTRADOR",
  accountType: "ORGANIZATION",
  organizationId: "org-1",
  status: "ACTIVE",
};

function Probe() {
  const state = useFilters();
  return (
    <div>
      <p data-testid="applied-city">{state.filters.city ?? ""}</p>
      <p data-testid="applied-warranty">{state.filters.warrantyStatus ?? ""}</p>
      <p data-testid="applied-from">{state.filters.dateFrom ?? ""}</p>
      <p data-testid="applied-to">{state.filters.dateTo ?? ""}</p>
      <p data-testid="draft-city">{state.draft.city ?? ""}</p>
      <p data-testid="draft-warranty">{state.draft.warrantyStatus ?? ""}</p>
      <p data-testid="count">{String(state.activeCount)}</p>
      <button
        type="button"
        onClick={() => state.setDraftFilter("city", "Barranquilla")}
      >
        draft city
      </button>
      <button
        type="button"
        onClick={() => state.setDraftFilter("warrantyStatus", "expiring")}
      >
        draft warranty
      </button>
      <button
        type="button"
        onClick={() => state.setDraftFilter("dateFrom", "2026-01-01")}
      >
        draft from
      </button>
      <button type="button" onClick={state.startDraft}>
        start draft
      </button>
      <button type="button" onClick={state.discardDraft}>
        discard draft
      </button>
      <button type="button" onClick={state.applyDraft}>
        apply
      </button>
      <button type="button" onClick={state.resetFilters}>
        reset
      </button>
    </div>
  );
}

describe("FilterProvider: global filters con borrador (FR-005)", () => {
  function setup() {
    return render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("arranca con los valores por defecto y sin filtros aplicados", () => {
    setup();

    expect(screen.getByTestId("applied-city").textContent).toBe("");
    expect(screen.getByTestId("applied-warranty").textContent).toBe("all");
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(DEFAULT_FILTERS.warrantyStatus).toBe("all");
  });

  it("mantiene las ventanas de garantía de la spec", () => {
    expect(WARRANTY_EXPIRING_IN_DAYS).toBe(30);
    expect(WARRANTY_EXPIRED_IN_DAYS).toBe(730);
  });

  it("escribir en el borrador no aplica ni cambia el badge", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("draft warranty"));

    expect(screen.getByTestId("draft-city").textContent).toBe("Barranquilla");
    expect(screen.getByTestId("applied-city").textContent).toBe("");
    expect(screen.getByTestId("applied-warranty").textContent).toBe("all");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("aplicar el borrador cambia los filtros aplicados y el badge", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));

    expect(screen.getByTestId("applied-city").textContent).toBe("Barranquilla");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("cerrar sin aplicar descarta el borrador y conserva lo aplicado", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));
    // A new draft change that is never applied.
    await userEventRef.click(screen.getByText("start draft"));
    await userEventRef.click(screen.getByText("draft city"));
    expect(screen.getByTestId("draft-city").textContent).toBe("Barranquilla");

    await userEventRef.click(screen.getByText("discard draft"));

    // The draft goes back to the applied value, which is untouched.
    expect(screen.getByTestId("draft-city").textContent).toBe("Barranquilla");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("abrir el panel carga el borrador con lo aplicado (sobrevive al ciclo)", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));
    await userEventRef.click(screen.getByText("discard draft"));
    await userEventRef.click(screen.getByText("start draft"));

    expect(screen.getByTestId("draft-city").textContent).toBe("Barranquilla");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("las fechas siguen el mismo modelo de borrador", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft from"));
    expect(screen.getByTestId("applied-from").textContent).toBe("");
    expect(screen.getByTestId("count").textContent).toBe("0");

    await userEventRef.click(screen.getByText("apply"));
    expect(screen.getByTestId("applied-from").textContent).toBe("2026-01-01");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("limpiar borra aplicados y borrador y deja el badge a 0", async () => {
    const userEventRef = userEvent.setup();
    setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));
    await userEventRef.click(screen.getByText("draft warranty"));

    await userEventRef.click(screen.getByText("reset"));

    expect(screen.getByTestId("applied-city").textContent).toBe("");
    expect(screen.getByTestId("applied-warranty").textContent).toBe("all");
    expect(screen.getByTestId("draft-warranty").textContent).toBe("all");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("persiste lo aplicado con scope por identidad y lo restaura", async () => {
    const userEventRef = userEvent.setup();
    const { unmount } = setup();

    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));

    const stored = window.localStorage.getItem(
      "automatizeit-filters:ORGANIZATION:org-1:user-1",
    );
    expect(stored).toContain("Barranquilla");
    unmount();

    setup();
    expect(screen.getByTestId("applied-city").textContent).toBe("Barranquilla");
  });

  it("otro usuario no hereda los filtros", async () => {
    const userEventRef = userEvent.setup();
    const { unmount } = setup();
    await userEventRef.click(screen.getByText("draft city"));
    await userEventRef.click(screen.getByText("apply"));
    unmount();

    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user: { ...user, id: "user-2", organizationId: "org-2" },
      login: vi.fn(),
      logout: vi.fn(),
    });
    setup();

    expect(screen.getByTestId("applied-city").textContent).toBe("");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("recoge un cambio aplicado en otra pestaña", async () => {
    setup();
    const scope = filterScopeOf(user);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: `automatizeit-filters:${scope}`,
          newValue: JSON.stringify({
            city: "Cartagena",
            warrantyStatus: "all",
          }),
        }),
      );
    });

    expect(screen.getByTestId("applied-city").textContent).toBe("Cartagena");
  });

  it("ignora eventos de storage de otra clave", () => {
    setup();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "otra-cosa",
          newValue: JSON.stringify({ city: "Lima" }),
        }),
      );
    });

    expect(screen.getByTestId("applied-city").textContent).toBe("");
  });

  it("ignora contenido de storage corrupto", () => {
    window.localStorage.setItem(
      "automatizeit-filters:ORGANIZATION:org-1:user-1",
      "{no-json",
    );

    setup();

    expect(screen.getByTestId("applied-city").textContent).toBe("");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("acota las cuentas de plataforma sin organización", () => {
    const platform: LoginUser = { ...user, organizationId: null };
    expect(filterScopeOf(platform)).toBe("ORGANIZATION:platform:user-1");
    expect(filterScopeOf(null)).toBe("anonymous");
  });
});
