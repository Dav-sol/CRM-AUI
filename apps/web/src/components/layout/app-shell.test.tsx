import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: "/dashboard",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push, replace: routerMocks.replace }),
  usePathname: () => routerMocks.pathname,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "id-1",
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { AppShell } from "@/components/layout/app-shell";

type MediaListener = (event: { matches: boolean }) => void;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaListener>();
  const instance = {
    get matches() {
      return matches;
    },
    media: "(max-width: 767.98px)",
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      ...instance,
      media: query,
    })),
  );
  return {
    set(mobile: boolean) {
      matches = mobile;
      listeners.forEach((listener) => listener({ matches: mobile }));
    },
  };
}

function sidebarAside() {
  return document.querySelector("aside[aria-label='Navegación principal']") as HTMLElement;
}

describe("AppShell: sidebar responsive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMocks.pathname = "/dashboard";
    vi.unstubAllGlobals();
  });

  it("móvil → sidebar inicia compacto (rail w-16)", () => {
    installMatchMedia(true);
    render(<AppShell>contenido</AppShell>);

    expect(sidebarAside().className).toContain("w-16");
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("desktop → sidebar inicia expandido (w-60)", () => {
    installMatchMedia(false);
    render(<AppShell>contenido</AppShell>);

    expect(sidebarAside().className).toContain("w-60");
  });

  it("móvil → expandir con el toggle y navegar vuelve al rail", async () => {
    installMatchMedia(true);
    const userEv = userEvent.setup();
    const { rerender } = render(<AppShell>contenido</AppShell>);

    await userEv.click(screen.getByRole("button", { name: "Expandir menú" }));
    expect(sidebarAside().className).toContain("w-60");

    routerMocks.pathname = "/customers";
    rerender(<AppShell>contenido</AppShell>);

    expect(sidebarAside().className).toContain("w-16");
  });

  it("móvil → el rail expone aria-label en los links de navegación", () => {
    installMatchMedia(true);
    render(<AppShell>contenido</AppShell>);

    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("transición a móvil → colapsa el sidebar aunque estuviera expandido", async () => {
    const media = installMatchMedia(false);
    render(<AppShell>contenido</AppShell>);
    expect(sidebarAside().className).toContain("w-60");

    act(() => media.set(true));
    await waitFor(() => expect(sidebarAside().className).toContain("w-16"));
  });

  it("transición a desktop → restaura siempre el sidebar expandido", async () => {
    const media = installMatchMedia(true);
    render(<AppShell>contenido</AppShell>);
    expect(sidebarAside().className).toContain("w-16");

    act(() => media.set(false));
    await waitFor(() => expect(sidebarAside().className).toContain("w-60"));
  });

  it("desktop → navegar mantiene el colapso manual (sin restauración forzada)", async () => {
    installMatchMedia(false);
    const userEv = userEvent.setup();
    const { rerender } = render(<AppShell>contenido</AppShell>);

    await userEv.click(screen.getByRole("button", { name: "Colapsar menú" }));
    expect(sidebarAside().className).toContain("w-16");

    routerMocks.pathname = "/customers";
    rerender(<AppShell>contenido</AppShell>);

    expect(sidebarAside().className).toContain("w-16");
  });

  it("móvil → touch targets de navegación ≥ 40px (h-10)", () => {
    installMatchMedia(true);
    render(<AppShell>contenido</AppShell>);

    const link = screen.getByRole("link", { name: "Clientes" });
    const item = link.querySelector("span");
    expect(item?.className).toContain("h-10");
  });
});