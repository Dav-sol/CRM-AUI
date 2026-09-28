"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import type { LoginUser } from "@/lib/sdk-types";

/**
 * Global filters: the commercial dimensions an advisor sets once in the header
 * and that apply to the screens whose endpoint supports them
 * (specs/023-filters-v1 Q1).
 */
export type GlobalFilters = {
  /** Partial match over the customer city (free text, `contains` on the API) */
  city?: string;
  /** Warranty window, translated into warrantyExpiringInDays/warrantyExpiredInDays */
  warrantyStatus?: "all" | "expiring" | "expired";
  /** Inclusive date range, translated per screen (created/purchase/scheduled date) */
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Windows behind the warranty filter (specs/023-filters-v1 Q6, human decision
 * 2026-09-27): "Por vencer" is the next 30 days and "Vencida" reaches back two
 * years. Both fit inside the API limits, so no contract change is needed.
 */
export const WARRANTY_EXPIRING_IN_DAYS = 30;
export const WARRANTY_EXPIRED_IN_DAYS = 730;

type FilterContextValue = {
  filters: GlobalFilters;
  setFilter: <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) => void;
  resetFilters: () => void;
  /** Number of active filters, excluding defaults */
  activeCount: number;
};

export const DEFAULT_FILTERS: GlobalFilters = {
  city: undefined,
  warrantyStatus: "all",
  dateFrom: undefined,
  dateTo: undefined,
};

const STORAGE_PREFIX = "automatizeit-filters";

type Identity = Pick<LoginUser, "id" | "organizationId" | "accountType">;

/**
 * Storage scope for one identity. Filters persist across reloads and logouts for
 * the same user, and a different user (or a different organization) never
 * inherits them. `organizationId` is null for platform accounts.
 */
export function filterScopeOf(user: Identity | null): string {
  if (!user) return "anonymous";
  return `${user.accountType}:${user.organizationId ?? "platform"}:${user.id}`;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function parseFilters(raw: string | null): GlobalFilters {
  if (!raw) return DEFAULT_FILTERS;
  try {
    const parsed = JSON.parse(raw) as Partial<GlobalFilters>;
    const warranty = parsed.warrantyStatus;
    return {
      city: typeof parsed.city === "string" ? parsed.city : undefined,
      warrantyStatus:
        warranty === "expiring" || warranty === "expired" ? warranty : "all",
      dateFrom:
        typeof parsed.dateFrom === "string" ? parsed.dateFrom : undefined,
      dateTo: typeof parsed.dateTo === "string" ? parsed.dateTo : undefined,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function loadFilters(scope: string): GlobalFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    return parseFilters(window.localStorage.getItem(storageKey(scope)));
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(scope: string, filters: GlobalFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(filters));
  } catch {
    // Storage full or blocked: the filters simply do not survive the reload.
  }
}

function countActive(filters: GlobalFilters): number {
  let count = 0;
  if (filters.city?.trim()) count++;
  if (filters.warrantyStatus && filters.warrantyStatus !== "all") count++;
  if (filters.dateFrom) count++;
  if (filters.dateTo) count++;
  return count;
}

const FilterContext = createContext<FilterContextValue | null>(null);

/**
 * Mounted by AppShell, so it only exists for a signed-in user: the initial
 * state can read that user's stored filters without waiting for an effect, and
 * a logout unmounts the provider instead of resetting state from an effect.
 */
export function FilterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scope = filterScopeOf(user);
  const [filters, setFiltersState] = useState<GlobalFilters>(() =>
    loadFilters(scope),
  );

  useEffect(() => {
    saveFilters(scope, filters);
  }, [scope, filters]);

  // Another tab of the same browser applied the filters for this identity.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey(scope) || event.newValue === null) return;
      setFiltersState(parseFilters(event.newValue));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const setFilter = useCallback(
    <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
  }, []);

  const value = useMemo(
    () => ({
      filters,
      setFilter,
      resetFilters,
      activeCount: countActive(filters),
    }),
    [filters, setFilter, resetFilters],
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
