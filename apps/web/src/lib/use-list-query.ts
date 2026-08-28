"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

/**
 * List filters persisted in the URL (shareable, survive reloads) following
 * API_GUIDELINES §10-13: page, sort, search, status/type and date ranges.
 * Unknown query params are preserved. Changing a filter resets the page to 1.
 */
export type ListQueryState = {
  page: number;
  sort?: string;
  search?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
};

type ListQueryDefaults = Omit<ListQueryState, "page">;

const READ_KEYS: Array<keyof ListQueryState> = [
  "page",
  "sort",
  "search",
  "status",
  "type",
  "from",
  "to",
  "compareFrom",
  "compareTo",
];

function readFromUrl(
  searchParams: URLSearchParams,
  defaults: ListQueryDefaults,
): ListQueryState {
  const state: ListQueryState = {
    page: Number(searchParams.get("page") ?? "1") || 1,
    ...defaults,
  };
  for (const key of READ_KEYS) {
    const raw = searchParams.get(key);
    if (raw !== null && raw !== "") {
      if (key === "page") {
        state.page = Number(raw) || 1;
      } else {
        state[key] = raw;
      }
    }
  }
  return state;
}

export function useListQuery(defaults: ListQueryDefaults) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => readFromUrl(new URLSearchParams(searchParams.toString()), defaults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [state, setState] = useState<ListQueryState>(initial);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of READ_KEYS) {
      const value = state[key];
      const isDefault =
        value === undefined ||
        value === "" ||
        value === (defaults as Record<string, unknown>)[key] ||
        (key === "page" && value === 1);
      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    const target = qs ? `?${qs}` : window.location.pathname;
    router.replace(target, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function set(patch: Partial<ListQueryState>) {
    setState((current) => {
      const resetsPage =
        patch.page === undefined &&
        (patch.sort !== undefined ||
          patch.search !== undefined ||
          patch.status !== undefined ||
          patch.type !== undefined ||
          patch.from !== undefined ||
          patch.to !== undefined);
      return { ...current, ...patch, ...(resetsPage ? { page: 1 } : {}) };
    });
  }

  function reset() {
    setState({ ...defaults, page: 1 });
  }

  return { state, set, reset };
}