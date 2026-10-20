import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

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
  /**
   * Respuesta a un botón interactivo (Tarea 1, transporte únicamente).
   * Meta la envía como `interactive.button_reply`; aquí solo se normaliza y
   * persiste. NINGUNA decisión de negocio se deriva en este módulo: el
   * lifecycle interpreta estos campos, el provider no.
   */
  buttonId?: string;
  buttonTitle?: string;
  /**
   * `context.id` de Meta: wamid del mensaje saliente que llevaba el botón.
   * Permite atribuir el clic sin adivinar.
   */
  inReplyToProviderId?: string;
}

export interface ProviderStatusUpdate {
  providerMessageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: string;
  providerConversationId: string | null;
}

export interface WhatsAppProvider {
  /**
   * Envía un mensaje por el proveedor. `organizationId` es obligatorio para la
   * autorización de salida (AUTO-SAFETY-002): sin él, el permiso no puede
   * concederse y el envío se bloquea.
   */
  sendMessage(
    to: string,
    text: string,
    organizationId?: string | null,
  ): Promise<ProviderSendResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface InboundWebhookPayload {
  messages: ProviderInboundMessage[];
  statuses: ProviderStatusUpdate[];
}

@Injectable()
export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MetaWhatsAppProvider.name);

  // Mandatory dependency (AUTO-SAFETY-002): this provider is the Meta
  // fallback route, so it must be unable to exist without the policy.
  constructor(
    private readonly configService: ConfigService,
    private readonly sendPermit: SendPermitGuard,
  ) {}

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

  async sendMessage(
    to: string,
    text: string,
    organizationId?: string | null,
  ): Promise<ProviderSendResult> {
    // Last barrier: nothing reaches the Meta Graph API without an explicit
    // permit. Throws SendBlockedError, never a provider error.
    this.sendPermit.assert(organizationId, 'WHATSAPP');
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
      context?: { id?: string };
      interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
      };
    };
    if (!msg?.id || !msg?.from) {
      return null;
    }
    // Solo `button_reply` tiene semántica reconocida. Cualquier otro tipo
    // interactivo (listas, formularios, ubicaciones) cae al comportamiento
    // actual: texto vacío, sin inferir nada.
    const buttonReply =
      msg.interactive?.type === 'button_reply'
        ? msg.interactive.button_reply
        : undefined;
    const buttonId =
      typeof buttonReply?.id === 'string' && buttonReply.id.length > 0
        ? buttonReply.id
        : undefined;
    const buttonTitle =
      typeof buttonReply?.title === 'string' && buttonReply.title.length > 0
        ? buttonReply.title
        : undefined;
    const inReplyToProviderId =
      typeof msg.context?.id === 'string' && msg.context.id.length > 0
        ? msg.context.id
        : undefined;
    return {
      providerMessageId: msg.id,
      from: msg.from,
      text: msg.text?.body ?? '',
      timestamp: msg.timestamp ?? new Date().toISOString(),
      providerConversationId: msg.conversation?.id ?? null,
      ...(buttonId !== undefined ? { buttonId } : {}),
      ...(buttonTitle !== undefined ? { buttonTitle } : {}),
      ...(inReplyToProviderId !== undefined ? { inReplyToProviderId } : {}),
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
