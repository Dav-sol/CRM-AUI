import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiLogin: vi.fn(), apiLogout: vi.fn(), apiMe: vi.fn() };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerMocks.push, replace: routerMocks.replace }),
  usePathname: () => "/dashboard",
}));

import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { apiLogin } from "@/lib/api";
import { authStore, notifySessionExpired } from "@/lib/auth";
import { toast } from "sonner";

const loginData = {
  accessToken: "access-token",
  expiresIn: 3600,
  user: {
    uuid: "u1",
    firstName: "Ana",
    lastName: "García",
    email: "ana@automatize.test",
    role: "ADMINISTRADOR",
    accountType: "ORGANIZATION",
    organizationId: "org-1",
  },
};

function SessionProbe() {
  const { status, login, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <button onClick={() => void login("ana@automatize.test", "pass")}>login</button>
      <button onClick={() => notifySessionExpired()}>expirar</button>
    </div>
  );
}

async function loginAs(clickLogin: () => Promise<void>) {
  await act(async () => {
    await clickLogin();
  });
}

describe("sesión expirada: feedback + limpieza + redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiLogin).mockResolvedValue(loginData as never);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 400, ok: false } as Response),
    );
    authStore.setToken(null);
    routerMocks.replace.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("expiración → toast único + estado unauthenticated + token limpiado", async () => {
    const userEv = userEvent.setup();
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));

    await loginAs(() => userEv.click(screen.getByText("login")));
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(authStore.token).toBe("access-token");

    await userEv.click(screen.getByText("expirar"));

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(authStore.token).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Tu sesión ha expirado. Inicia sesión nuevamente.",
    );

    await userEv.click(screen.getByText("expirar"));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("AppShell redirige a /login al expirar la sesión", async () => {
    const userEv = userEvent.setup();
    function LoginButton() {
      const { login } = useAuth();
      return (
        <div>
          <button onClick={() => void login("ana@automatize.test", "pass")}>
            iniciar-sesion
          </button>
          <button onClick={() => notifySessionExpired()}>expirar</button>
        </div>
      );
    }
    render(
      <AuthProvider>
        <LoginButton />
        <AppShell>
          <div>contenido protegido</div>
        </AppShell>
      </AuthProvider>,
    );

    await waitFor(() => expect(routerMocks.replace).toHaveBeenCalledWith("/login"));

    await loginAs(() => userEv.click(screen.getByText("iniciar-sesion")));
    await waitFor(() => expect(screen.getByText("contenido protegido")).toBeVisible());

    await userEv.click(screen.getByText("expirar"));

    await waitFor(() => expect(routerMocks.replace).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("contenido protegido")).not.toBeInTheDocument();
  });
});