"use client";

import type { LoginUser } from "@/lib/sdk-types";
import { toast } from "sonner";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, apiLogin, apiLogout, apiMe } from "@/lib/api";
import { authStore, onSessionExpired, refreshAccessToken } from "@/lib/auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: LoginUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<LoginUser | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      if (!expiredRef.current) {
        expiredRef.current = true;
        toast.error("Tu sesión ha expirado. Inicia sesión nuevamente.");
      }
      authStore.setToken(null);
      setUser(null);
      setStatus("unauthenticated");
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin({ email, password });
    expiredRef.current = false;
    authStore.setToken(data.accessToken);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // logout is best-effort; clear local session regardless
    }
    authStore.setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const token = await refreshAccessToken();
      if (cancelled) {
        return;
      }
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const data = await apiMe();
        if (cancelled) {
          return;
        }
        setUser(data.user ?? null);
        setStatus("authenticated");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          authStore.setToken(null);
          setStatus("unauthenticated");
          return;
        }
        setStatus("authenticated");
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}