import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface ProviderSendResult {
  providerMessageId: string;
  providerConversationId: string | null;
  status: 'SENT';
}

export interface ProviderInboundMessage {
  providerMessageId: string;
  from: string;
  text: string;
  timestamp: string;
  providerConversationId: string | null;
}

export interface ProviderStatusUpdate {
  providerMessageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  providerConversationId: string | null;
}

export interface WhatsAppProvider {
  sendMessage(to: string, text: string): Promise<ProviderSendResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface InboundWebhookPayload {
  messages: ProviderInboundMessage[];
  statuses: ProviderStatusUpdate[];
}

@Injectable()
export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MetaWhatsAppProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private get apiToken(): string {
    return this.configService.get<string>('whatsapp.apiToken') ?? '';
  }

  private get phoneNumberId(): string {
    return this.configService.get<string>('whatsapp.phoneNumberId') ?? '';
  }

  private get apiUrl(): string {
    return (
      this.configService.get<string>('whatsapp.apiUrl') ??
      'https://graph.facebook.com/v21.0'
    );
  }

  private get webhookSecret(): string {
    return this.configService.get<string>('whatsapp.webhookSecret') ?? '';
  }

  async sendMessage(to: string, text: string): Promise<ProviderSendResult> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      });
    } catch (error) {
      this.logger.error(
        'provider request failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ProviderSendError();
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(
        `provider responded ${response.status} ${response.statusText}`,
        detail ? { detail } : undefined,
      );
      throw new ProviderSendError();
    }

    const body = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[];
      contacts?: { wa_id?: string }[];
    } | null;
    const providerMessageId = body?.messages?.[0]?.id;
    if (!providerMessageId) {
      this.logger.warn('provider response missing message id');
      throw new ProviderSendError();
    }

    return {
      providerMessageId,
      providerConversationId: body?.contacts?.[0]?.wa_id ?? null,
      status: 'SENT',
    };
  }

  verifySignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): boolean {
    if (!signatureHeader || !this.webhookSecret) {
      return false;
    }
    const expected = `sha256=${createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex')}`;
    const provided = Buffer.from(signatureHeader);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length) {
      return false;
    }
    return timingSafeEqual(provided, computed);
  }

  parseInbound(rawBody: unknown): InboundWebhookPayload {
    const body = rawBody as {
      entry?: {
        changes?: {
          value?: {
            messages?: unknown[];
            statuses?: unknown[];
          };
        }[];
      }[];
    };
    const messages: ProviderInboundMessage[] = [];
    const statuses: ProviderStatusUpdate[] = [];

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        for (const message of value?.messages ?? []) {
          const parsed = this.parseMessage(message);
          if (parsed) {
            messages.push(parsed);
          }
        }
        for (const status of value?.statuses ?? []) {
          const parsed = this.parseStatus(status);
          if (parsed) {
            statuses.push(parsed);
          }
        }
      }
    }

    return { messages, statuses };
  }

  private parseMessage(message: unknown): ProviderInboundMessage | null {
    const msg = message as {
      id?: string;
      from?: string;
      text?: { body?: string };
      timestamp?: string;
      conversation?: { id?: string };
    };
    if (!msg?.id || !msg?.from) {
      return null;
    }
    return {
      providerMessageId: msg.id,
      from: msg.from,
      text: msg.text?.body ?? '',
      timestamp: msg.timestamp ?? new Date().toISOString(),
      providerConversationId: msg.conversation?.id ?? null,
    };
  }

  private parseStatus(status: unknown): ProviderStatusUpdate | null {
    const st = status as {
      id?: string;
      status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
      timestamp?: string;
      conversation?: { id?: string };
    };
    if (!st?.id) {
      return null;
    }
    return {
      providerMessageId: st.id,
      status: st.status ?? 'SENT',
      timestamp: st.timestamp ?? new Date().toISOString(),
      providerConversationId: st.conversation?.id ?? null,
    };
  }
}

export class ProviderSendError extends Error {
  constructor() {
    super('WhatsApp provider send failed');
    this.name = 'ProviderSendError';
  }
}
