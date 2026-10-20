"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { GLOBAL_URL_KEYS, type GlobalFilters } from "@/lib/filter-provider";

/**
 * Publishes the applied global filters to the query string
 * (specs/023-filters-v1 FR-004/FR-005): the URL shows what is applied, never
 * what is in the draft, and it is written with a single replace so an applied
 * change costs one history entry and no extra request.
 *
 * It lives outside the provider on purpose: the provider is mounted by
 * AppShell, so depending on the router there would make every screen that
 * renders the panel (and every test that renders AppShell) depend on routing
 * mocks. Screens opt in by calling this hook with the applied filters.
 *
 * Only the global keys are written and the screen's own keys are preserved, so
 * both writers can coexist on the same URL.
 */
export function useGlobalFilterUrl(filters: GlobalFilters): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const snapshot = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(snapshot);
    for (const key of GLOBAL_URL_KEYS) {
      const value = filters[key];
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Already in sync: nothing to write, and no re-render loop.
    if (params.toString() === snapshot) return;

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, router, pathname, snapshot]);
}
