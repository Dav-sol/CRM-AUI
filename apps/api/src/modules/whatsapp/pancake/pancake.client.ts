import { Inject, Injectable, Logger } from '@nestjs/common';

export interface PancakeClientConfig {
  apiToken: string; // Pancake page_access_token (query param, never logged)
  pageId: string;
  apiBaseUrl: string; // e.g. https://pages.fm/api/public_api
  templatesApiUrl: string; // e.g. https://botcake.io/api/public_api/v1
  // Botcake API token (Botcake > Configuración > Integraciones > API). Used as
  // a Bearer token for botcake.io endpoints (message_templates).
  botcakeApiToken?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
  // Whether ambiguous failures (timeout/network) should be auto-retried.
  // Default false: a send that may have reached the provider is never retried
  // (Pancake has no idempotency key, retries could duplicate messages).
  retryOnAmbiguous?: boolean;
}

export const PANCAKE_CLIENT_CONFIG = Symbol('PANCAKE_CLIENT_CONFIG');

export class PancakeError extends Error {
  // Whether retrying this failure is safe (idempotent side). false = terminal.
  retryable?: boolean;
}
export class PancakeAuthError extends PancakeError {}
export class PancakeNotFoundError extends PancakeError {}
export class PancakeRateLimitError extends PancakeError {}
export class PancakeServerError extends PancakeError {}
export class PancakeTimeoutError extends PancakeError {}
export class PancakeApiError extends PancakeError {
  // Pancake's own error_code when present (e.g. 120 = conversation not found,
  // validated live). Lets callers/logs tell apart account failures from
  // payload failures instead of a bare "success=false".
  errorCode?: number;
  // Pancake's structured code, e.g. waba_1999667 = "Wallet not enough money"
  // (validated live 2026-09-25) — the handle to give Pancake/Meta support.
  messageCode?: string;
} // HTTP ok but success=false

@Injectable()
export class PancakeClient {
  private readonly logger = new Logger(PancakeClient.name);
  private lastRequestAt = 0;

  constructor(
    @Inject(PANCAKE_CLIENT_CONFIG) private readonly config: PancakeClientConfig,
  ) {}

  get baseUrl(): string {
    return this.config.apiBaseUrl;
  }

  get templatesUrl(): string {
    return this.config.templatesApiUrl;
  }

  get pageId(): string {
    return this.config.pageId;
  }

  // Pancake authenticates via a query parameter, not an Authorization header.
  buildUrl(
    baseUrl: string,
    path: string,
    extra: Record<string, string | number | boolean | undefined> = {},
  ): string {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('page_access_token', this.config.apiToken);
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  // botcake.io authenticates via `Authorization: Bearer <botcake token>`
  // (validated against the real API). No page_access_token query.
  async getBearer<T>(
    path: string,
    baseUrl = this.config.templatesApiUrl,
  ): Promise<T> {
    const token = this.config.botcakeApiToken;
    if (!token) {
      const error = new PancakeAuthError(
        'Pancake botcake token is not configured',
      );
      error.retryable = false;
      throw error;
    }
    return this.request<T>(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async get<T>(
    path: string,
    baseUrl = this.config.apiBaseUrl,
    extra: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    return this.request<T>(this.buildUrl(baseUrl, path, extra), {
      method: 'GET',
    });
  }

  async post<T>(
    path: string,
    body: unknown,
    baseUrl = this.config.apiBaseUrl,
  ): Promise<T> {
    return this.request<T>(this.buildUrl(baseUrl, path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    await this.throttle();

    const timeoutMs = this.config.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      const isAbort =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError');
      if (isAbort) {
        const timeout = new PancakeTimeoutError('Pancake request timed out');
        timeout.retryable = this.config.retryOnAmbiguous ?? false;
        throw timeout;
      }
      this.logger.warn(
        'pancake network request failed',
        error instanceof Error ? error.message : String(error),
      );
      const network = new PancakeServerError(
        'Pancake request failed (network)',
      );
      network.retryable = this.config.retryOnAmbiguous ?? false;
      throw network;
    } finally {
      clearTimeout(timer);
    }

    // Never log the token: only status and, on error, a sanitized body.
    if (response.status === 401 || response.status === 403) {
      const err = new PancakeAuthError(
        `Pancake authentication failed (${response.status})`,
      );
      err.retryable = false;
      throw err;
    }
    if (response.status === 404) {
      const err = new PancakeNotFoundError('Pancake resource not found (404)');
      err.retryable = false;
      throw err;
    }
    if (response.status === 429) {
      const err = new PancakeRateLimitError(
        'Pancake rate limit exceeded (429)',
      );
      err.retryable = true;
      throw err;
    }
    if (response.status >= 500) {
      const err = new PancakeServerError(
        `Pancake server error (${response.status})`,
      );
      err.retryable = true;
      throw err;
    }

    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
    } | null;
    if (!response.ok) {
      const err = new PancakeServerError(
        `Pancake responded ${response.status} ${response.statusText}`,
      );
      err.retryable = true;
      throw err;
    }
    if (body && body.success === false) {
      // Pancake reports application failures as HTTP 200 + success:false with
      // a message, error_code/message_code (validated live: "Wallet not enough
      // money" + message_code waba_1999667; "conversation_id not found" +
      // error_code 120; "Template not found"). Dropping them made every
      // Pancake rejection indistinguishable in the logs, so the real reason a
      // send was blocked could not be diagnosed from the CRM side.
      const detail = body as {
        message?: unknown;
        error_code?: unknown;
        message_code?: unknown;
      };
      const err = new PancakeApiError(
        `Pancake API returned success=false${this.describeFailure(detail)}`,
      );
      if (typeof detail.error_code === 'number') {
        err.errorCode = detail.error_code;
      }
      if (typeof detail.message_code === 'string' && detail.message_code) {
        err.messageCode = detail.message_code.slice(0, 60);
      }
      err.retryable = false;
      throw err;
    }
    return body as T;
  }

  // Format Pancake's failure detail for the error message, redacting the page
  // access token so it can never reach a log line.
  private describeFailure(detail: {
    message?: unknown;
    error_code?: unknown;
    message_code?: unknown;
  }): string {
    const message =
      typeof detail.message === 'string'
        ? detail.message.replace(/\s+/g, ' ').trim().slice(0, 200)
        : '';
    const errorCode =
      typeof detail.error_code === 'number'
        ? ` (error_code=${detail.error_code})`
        : '';
    const messageCode =
      typeof detail.message_code === 'string' && detail.message_code
        ? ` (message_code=${detail.message_code.slice(0, 60)})`
        : '';
    return `${message ? `: ${this.redact(message)}` : ''}${errorCode}${messageCode}`;
  }

  private redact(value: string): string {
    let out = value;
    const token = this.config.apiToken;
    if (token) {
      out = out.split(token).join('[redacted]');
    }
    return out.replace(
      /page_access_token=[^&\s]+/gi,
      'page_access_token=[redacted]',
    );
  }

  // Pancake limits public API calls to ~5 per page per second (document.md).
  // Enforce a minimum interval between requests to the same page.
  private async throttle(): Promise<void> {
    const minIntervalMs = this.config.minIntervalMs ?? 250;
    if (minIntervalMs <= 0) {
      this.lastRequestAt = Date.now();
      return;
    }
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < minIntervalMs) {
      await this.sleep(minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
