import {
  PancakeApiError,
  PancakeAuthError,
  PancakeClient,
  PancakeNotFoundError,
  PancakeRateLimitError,
  PancakeServerError,
  PancakeTimeoutError,
  type PancakeClientConfig,
} from './pancake.client';

const CONFIG: PancakeClientConfig = {
  apiToken: 'tok-secret-abc',
  pageId: 'waba_1146111635255630',
  apiBaseUrl: 'https://pages.fm/api/public_api',
  templatesApiUrl: 'https://botcake.io/api/public_api/v1',
  botcakeApiToken: 'botcake-secret',
  timeoutMs: 1000,
  minIntervalMs: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('PancakeClient', () => {
  let client: PancakeClient;

  beforeEach(() => {
    client = new PancakeClient({ ...CONFIG });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it('appends page_access_token and extra params to the URL query', () => {
    const url = client.buildUrl(
      CONFIG.apiBaseUrl,
      '/v2/pages/waba_1146111635255630/conversations',
      { last_conversation_id: 'c-1', unread_first: true },
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('page_access_token')).toBe('tok-secret-abc');
    expect(parsed.searchParams.get('last_conversation_id')).toBe('c-1');
    expect(parsed.searchParams.get('unread_first')).toBe('true');
  });

  it('performs a GET and returns the parsed body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ conversations: [{ id: 'c-1' }] }),
    );
    const result = await client.get<{ conversations: { id: string }[] }>(
      '/v2/pages/p1/conversations',
      CONFIG.apiBaseUrl,
    );
    expect(result.conversations[0].id).toBe('c-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('GET');
    expect(String(url)).toContain('page_access_token=tok-secret-abc');
  });

  it('getBearer sends the botcake token as a Bearer header without query token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, data: [{ id: 't-1' }] }),
    );
    const result = await client.getBearer<{ data: { id: string }[] }>(
      '/pages/p1/message_templates',
    );
    expect(result.data[0].id).toBe('t-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).not.toContain('page_access_token');
    expect(init.headers).toEqual({
      Authorization: 'Bearer botcake-secret',
    });
  });

  it('getBearer throws auth error when the botcake token is missing', async () => {
    const noBotcake = new PancakeClient({
      ...CONFIG,
      botcakeApiToken: undefined,
    });
    await expect(
      noBotcake.getBearer('/pages/p1/message_templates'),
    ).rejects.toBeInstanceOf(PancakeAuthError);
  });

  it('marks ambiguous failures (timeout/network) as non-retryable by default', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortError);
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('marks 429 and 5xx as retryable', async () => {
    for (const status of [429, 500]) {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, status));
      await expect(
        client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
      ).rejects.toMatchObject({ retryable: true });
    }
  });

  it('marks auth/not-found/success=false as non-retryable', async () => {
    for (const status of [401, 403, 404]) {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, status));
      await expect(
        client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
      ).rejects.toMatchObject({ retryable: false });
    }
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: false }),
    );
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('throws PancakeApiError when the API returns success=false', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: false }),
    );
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toBeInstanceOf(PancakeApiError);
  });

  it('maps 401/403 to PancakeAuthError', async () => {
    for (const status of [401, 403]) {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, status));
      await expect(
        client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
      ).rejects.toBeInstanceOf(PancakeAuthError);
    }
  });

  it('maps 404 to PancakeNotFoundError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 404));
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toBeInstanceOf(PancakeNotFoundError);
  });

  it('maps 429 to PancakeRateLimitError', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 429));
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toBeInstanceOf(PancakeRateLimitError);
  });

  it('maps 5xx to PancakeServerError', async () => {
    for (const status of [500, 502, 503]) {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, status));
      await expect(
        client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
      ).rejects.toBeInstanceOf(PancakeServerError);
    }
  });

  it('maps an aborted fetch (timeout) to PancakeTimeoutError', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortError);
    await expect(
      client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl),
    ).rejects.toBeInstanceOf(PancakeTimeoutError);
  });

  it('POSTs a JSON body to the given path', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, id: 'm-1' }),
    );
    const result = await client.post<{ id: string }>(
      '/v1/pages/p1/conversations/c1/messages',
      { action: 'reply_inbox', message: 'hola' },
    );
    expect(result.id).toBe('m-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toContain('reply_inbox');
    expect(String(url)).toContain('page_access_token=tok-secret-abc');
  });

  it('never logs the token', async () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 500));
    try {
      await client.get('/v2/pages/p1/conversations', CONFIG.apiBaseUrl);
    } catch {
      // expected
    }
    const logged = errorSpy.mock.calls.map((call) =>
      call.map(String).join(' '),
    );
    expect(logged.join(' ')).not.toContain('tok-secret-abc');
    errorSpy.mockRestore();
  });

  it('respects the per-page minimum interval between requests', async () => {
    const intervalClient = new PancakeClient({
      ...CONFIG,
      minIntervalMs: 100,
    });
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}));
    const start = Date.now();
    await intervalClient.get('/v2/pages/p1/conversations');
    await intervalClient.get('/v2/pages/p1/conversations');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
