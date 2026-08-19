import { refresh } from "@automatize-it/sdk";

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

const sessionExpiredListeners = new Set<() => void>();

export function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) {
    listener();
  }
}

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

export const authStore = {
  get token(): string | null {
    return accessToken;
  },
  setToken(token: string | null): void {
    accessToken = token;
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await refresh({ credentials: "include" });
        if (res.status === 200) {
          const payload = res.data as { data?: { accessToken?: string } } | undefined;
          const access = payload?.data?.accessToken;
          if (access) {
            accessToken = access;
            notify();
            return accessToken;
          }
        }
        accessToken = null;
        notify();
        return null;
      } catch {
        accessToken = null;
        notify();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}