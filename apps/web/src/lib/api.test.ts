import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@automatize-it/sdk", () => ({
  listConversations: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  notifySessionExpired: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authStore: {
    get token(): string | null {
      return "token-de-prueba";
    },
    setToken: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
  notifySessionExpired: mocks.notifySessionExpired,
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { listConversations } from "@automatize-it/sdk";
import { apiListConversations, SessionExpiredError } from "@/lib/api";

const http = (status: number, data: unknown) => ({ status, data }) as never;

describe("api call: sesión expirada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 + refresh fallido → SessionExpiredError + notifySessionExpired", async () => {
    vi.mocked(listConversations).mockResolvedValue(http(401, {}));
    vi.mocked(mocks.refreshAccessToken).mockResolvedValue(null);

    await expect(apiListConversations()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(mocks.notifySessionExpired).toHaveBeenCalledTimes(1);
  });

  it("401 + refresh ok + retry 401 → SessionExpiredError + notifySessionExpired", async () => {
    vi.mocked(listConversations)
      .mockResolvedValueOnce(http(401, {}))
      .mockResolvedValueOnce(http(401, {}));
    vi.mocked(mocks.refreshAccessToken).mockResolvedValue("token-nuevo");

    await expect(apiListConversations()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(mocks.notifySessionExpired).toHaveBeenCalledTimes(1);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("401 + refresh ok + retry 200 → data unwrap, sin notifySessionExpired", async () => {
    const items = [{ uuid: "c1" }];
    vi.mocked(listConversations)
      .mockResolvedValueOnce(http(401, {}))
      .mockResolvedValueOnce(http(200, { data: items }));
    vi.mocked(mocks.refreshAccessToken).mockResolvedValue("token-nuevo");

    const data = await apiListConversations();
    expect(data).toEqual(items);
    expect(mocks.notifySessionExpired).not.toHaveBeenCalled();
  });

  it("200 → data unwrap, sin refresh ni notifySessionExpired", async () => {
    const items = [{ uuid: "c2" }];
    vi.mocked(listConversations).mockResolvedValue(http(200, { data: items }));

    const data = await apiListConversations();
    expect(data).toEqual(items);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.notifySessionExpired).not.toHaveBeenCalled();
  });
});