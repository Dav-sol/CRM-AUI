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
  /** Applied filters: the only ones a screen sends and the badge counts */
  filters: GlobalFilters;
  /** Draft being edited in the panel; no request, no URL and no badge until applied */
  draft: GlobalFilters;
  /** Load the draft from the applied filters (opening the panel) */
  startDraft: () => void;
  /** Drop the draft and go back to the applied filters (closing without applying) */
  discardDraft: () => void;
  setDraftFilter: <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) => void;
  /** Commit the draft as the applied filters */
  applyDraft: () => void;
  /** Clear draft and applied filters */
  resetFilters: () => void;
  /** Number of applied filters, excluding defaults */
  activeCount: number;
};

export const DEFAULT_FILTERS: GlobalFilters = {
  city: undefined,
  warrantyStatus: "all",
  dateFrom: undefined,
  dateTo: undefined,
};

const STORAGE_PREFIX = "automatizeit-filters";

/**
 * URL keys carrying the global dimensions (see useGlobalFilterUrl, which
 * publishes the applied filters). They are deliberately not the screen's own
 * filter keys (`from`/`to`/`search`/...), so the URL shows applied global
 * filters and the screen's filters side by side without either writer dropping
 * the other's keys.
 */
export const GLOBAL_URL_KEYS = [
  "city",
  "warrantyStatus",
  "dateFrom",
  "dateTo",
] as const;

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

function normalize(
  raw: Partial<GlobalFilters> | null | undefined,
): GlobalFilters {
  const warranty = raw?.warrantyStatus;
  return {
    city:
      typeof raw?.city === "string" && raw.city.trim()
        ? raw.city.trim()
        : undefined,
    warrantyStatus:
      warranty === "expiring" || warranty === "expired" ? warranty : "all",
    dateFrom: typeof raw?.dateFrom === "string" ? raw.dateFrom : undefined,
    dateTo: typeof raw?.dateTo === "string" ? raw.dateTo : undefined,
  };
}

function fromSearchParams(search: URLSearchParams): GlobalFilters {
  return normalize({
    city: search.get("city") ?? undefined,
    warrantyStatus: (search.get("warrantyStatus") ?? undefined) as
      GlobalFilters["warrantyStatus"] | undefined,
    dateFrom: search.get("dateFrom") ?? undefined,
    dateTo: search.get("dateTo") ?? undefined,
  });
}

function hasUrlFilters(search: URLSearchParams): boolean {
  return GLOBAL_URL_KEYS.some((key) => search.get(key));
}

/**
 * Restore the applied filters: a shared link wins over the stored ones, so a
 * URL that carries the global dimensions is the source of truth for that visit
 * (specs/023-filters-v1 FR-004).
 */
export function restoreFilters(
  scope: string,
  search: URLSearchParams,
): GlobalFilters {
  if (hasUrlFilters(search)) return fromSearchParams(search);
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    return normalize(
      JSON.parse(
        window.localStorage.getItem(storageKey(scope)) ?? "null",
      ) as Partial<GlobalFilters> | null,
    );
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
 *
 * The provider owns state and storage only; publishing to the URL is the job of
 * useGlobalFilterUrl, so a component that renders the panel never has to know
 * about the router.
 */
export function FilterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scope = filterScopeOf(user);

  const [filters, setFilters] = useState<GlobalFilters>(() =>
    restoreFilters(scope, new URLSearchParams()),
  );
  const [draft, setDraft] = useState<GlobalFilters>(filters);

  // Persist the applied filters for this identity.
  useEffect(() => {
    saveFilters(scope, filters);
  }, [scope, filters]);

  // Another tab of the same browser applied the filters for this identity.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey(scope) || event.newValue === null) return;
      const applied = normalize(
        JSON.parse(event.newValue) as Partial<GlobalFilters>,
      );
      setFilters(applied);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const startDraft = useCallback(() => {
    setDraft(filters);
  }, [filters]);

  const discardDraft = useCallback(() => {
    setDraft(filters);
  }, [filters]);

  const setDraftFilter = useCallback(
    <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => {
      setDraft((prev) => normalize({ ...prev, [key]: value }));
    },
    [],
  );

  const applyDraft = useCallback(() => {
    setFilters(draft);
  }, [draft]);

  const resetFilters = useCallback(() => {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }, []);

  const value = useMemo(
    () => ({
      filters,
      draft,
      startDraft,
      discardDraft,
      setDraftFilter,
      applyDraft,
      resetFilters,
      activeCount: countActive(filters),
    }),
    [
      filters,
      draft,
      startDraft,
      discardDraft,
      setDraftFilter,
      applyDraft,
      resetFilters,
    ],
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
