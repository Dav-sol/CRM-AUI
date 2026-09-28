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
  const { filters, setFilter, resetFilters, activeCount } = useFilters();
  return (
    <div>
      <p data-testid="city">{filters.city ?? ""}</p>
      <p data-testid="warranty">{filters.warrantyStatus ?? ""}</p>
      <p data-testid="from">{filters.dateFrom ?? ""}</p>
      <p data-testid="count">{String(activeCount)}</p>
      <button type="button" onClick={() => setFilter("city", "Barranquilla")}>
        set city
      </button>
      <button
        type="button"
        onClick={() => setFilter("warrantyStatus", "expiring")}
      >
        set warranty
      </button>
      <button type="button" onClick={resetFilters}>
        reset
      </button>
    </div>
  );
}

describe("FilterProvider: global filters", () => {
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

  it("starts with the defaults and counts only real filters", () => {
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

    expect(screen.getByTestId("city").textContent).toBe("");
    expect(screen.getByTestId("warranty").textContent).toBe("all");
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(DEFAULT_FILTERS.warrantyStatus).toBe("all");
  });

  it("keeps the warranty windows in the spec", () => {
    expect(WARRANTY_EXPIRING_IN_DAYS).toBe(30);
    expect(WARRANTY_EXPIRED_IN_DAYS).toBe(730);
  });

  it("persists the filters scoped to the signed-in identity", async () => {
    const userEventRef = userEvent.setup();
    const { unmount } = render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

    await userEventRef.click(screen.getByText("set city"));
    await userEventRef.click(screen.getByText("set warranty"));

    expect(screen.getByTestId("count").textContent).toBe("2");
    const stored = window.localStorage.getItem(
      "automatizeit-filters:ORGANIZATION:org-1:user-1",
    );
    expect(stored).toContain("Barranquilla");
    expect(stored).toContain("expiring");
    unmount();

    // A new mount for the same user restores them.
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    expect(screen.getByTestId("city").textContent).toBe("Barranquilla");
    expect(screen.getByTestId("warranty").textContent).toBe("expiring");
  });

  it("does not leak the filters to another user", async () => {
    const userEventRef = userEvent.setup();
    const { unmount } = render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );
    await userEventRef.click(screen.getByText("set city"));
    unmount();

    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user: { ...user, id: "user-2", organizationId: "org-2" },
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

    expect(screen.getByTestId("city").textContent).toBe("");
  });

  it("picks up a change applied in another tab", async () => {
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

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

    expect(screen.getByTestId("city").textContent).toBe("Cartagena");
  });

  it("ignores a storage event for another key", () => {
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "otra-cosa",
          newValue: JSON.stringify({ city: "Lima" }),
        }),
      );
    });

    expect(screen.getByTestId("city").textContent).toBe("");
  });

  it("ignores corrupted storage content", () => {
    window.localStorage.setItem(
      "automatizeit-filters:ORGANIZATION:org-1:user-1",
      "{no-json",
    );
    render(
      <FilterProvider>
        <Probe />
      </FilterProvider>,
    );

    expect(screen.getByTestId("city").textContent).toBe("");
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("scopes platform accounts without an organization", () => {
    const platform: LoginUser = { ...user, organizationId: null };
    expect(filterScopeOf(platform)).toBe("ORGANIZATION:platform:user-1");
    expect(filterScopeOf(null)).toBe("anonymous");
  });
});
