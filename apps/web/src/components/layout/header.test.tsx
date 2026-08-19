import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push, replace: routerMocks.replace }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { useAuth } from "@/components/auth/auth-provider";
import { Header } from "@/components/layout/header";
import { toast } from "sonner";

const user = {
  id: "id-1",
  uuid: "u1",
  firstName: "Ana",
  lastName: "García",
  email: "ana@automatize.test",
  role: "ADMINISTRADOR",
  accountType: "ORGANIZATION",
  organizationId: "org-1",
  status: "ACTIVE",
} as const;

describe("Header: menú de usuario y logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no anida botones en los triggers (tooltips y menú)", async () => {
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user,
      login: vi.fn(),
      logout: vi.fn(),
    });
    const { container } = render(<Header collapsed={false} onToggleSidebar={() => {}} />);

    expect(container.querySelectorAll("button button")).toHaveLength(0);
  });

  it("abre el menú y cierra sesión", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user,
      login: vi.fn(),
      logout,
    });
    const userEv = userEvent.setup();
    render(<Header collapsed={false} onToggleSidebar={() => {}} />);

    await userEv.click(screen.getByRole("button", { name: "Menú de usuario" }));

    const logoutItem = await screen.findByText("Cerrar sesión");
    await userEv.click(logoutItem);

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(routerMocks.push).toHaveBeenCalledWith("/login");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("logout con fallo → toast de error + redirección igualmente", async () => {
    const logout = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(useAuth).mockReturnValue({
      status: "authenticated",
      user,
      login: vi.fn(),
      logout,
    });
    const userEv = userEvent.setup();
    render(<Header collapsed={false} onToggleSidebar={() => {}} />);

    await userEv.click(screen.getByRole("button", { name: "Menú de usuario" }));
    const logoutItem = await screen.findByText("Cerrar sesión");
    await userEv.click(logoutItem);

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(routerMocks.push).toHaveBeenCalledWith("/login");
  });
});