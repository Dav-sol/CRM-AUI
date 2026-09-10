import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PancakePublicApi, PancakeSendTemplateInput } from './pancake.adapter';
import { PancakeError } from './pancake.client';
import type {
  ProviderSendResult,
  WhatsAppProvider,
} from '../whatsapp.provider';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

// Drop-in replacement for WhatsAppProvider that sends through Pancake.
// NOT active by default: whatsapp.service only routes to this provider for
// PANCAKE_ORGANIZATION_ID (org-scoped) and only when configured.
//
// IMPORTANT (validated live): WhatsApp Business does NOT accept free-text
// InboxMessage outside the 24h customer-service window — and Pancake's API
// returns "Server internal error" for free-text on WhatsApp. Real
// automation sends must use sendTemplateMessage() with an APPROVED template.
// sendMessage() (InboxMessage) is kept for within-window replies only.
@Injectable()
export class PancakeWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly api: PancakePublicApi,
    private readonly configService: ConfigService,
  ) {}

  isConfigured(): boolean {
    const apiToken = this.configService.get<string>('pancake.apiToken');
    const pageId = this.configService.get<string>('pancake.pageId');
    return Boolean(apiToken && pageId);
  }

  private get pageId(): string {
    return this.configService.get<string>('pancake.pageId') ?? '';
  }

  private get senderId(): string | undefined {
    return this.configService.get<string>('pancake.senderId') || undefined;
  }

  // H4: when enabled, resolve the real conversation id via GET before sending
  // (covers the "CO." PSID conversations that the composed id misses).
  private get resolveConversationId(): boolean {
    return (
      this.configService.get<boolean>('pancake.resolveConversationId') ?? false
    );
  }

  async sendMessage(to: string, text: string): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new PancakeError('Pancake provider is not configured');
    }
    const conversationId =
      (await this.resolveConversation(to)) ?? `${this.pageId}_${to}`;
    const result = await this.api.sendInboxMessage(
      conversationId,
      text,
      this.senderId,
    );
    if (!result.id) {
      throw new PancakeError('Pancake send response missing id');
    }
    return {
      providerMessageId: result.id,
      providerConversationId: conversationId,
      status: 'SENT',
    };
  }

  // WhatsApp automation sends (out-of-window) must use an APPROVED template.
  async sendTemplateMessage(
    conversationId: string,
    input: PancakeSendTemplateInput,
  ): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new PancakeError('Pancake provider is not configured');
    }
    const result = await this.api.sendTemplate(conversationId, {
      ...input,
      senderId: input.senderId ?? this.senderId,
    });
    if (!result.id) {
      throw new PancakeError('Pancake send response missing id');
    }
    return {
      providerMessageId: result.id,
      providerConversationId: conversationId,
      status: 'SENT',
    };
  }

  // Global v1 (2026-09-10): every Pancake send (automations, manual, advisor
  // replies) goes through the single configured APPROVED template — free-text
  // InboxMessage always fails on WhatsApp (validated live). Params are named
  // BODY_PARAMS values (document.md:4246): customer_name, product_name,
  // organization_name. The template id comes from PANCAKE_TEMPLATE_ID; a
  // missing template is terminal (H5: no retry — it would fail again).
  async sendTemplate(
    to: string,
    params: Record<string, string>,
  ): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new PancakeError('Pancake provider is not configured');
    }
    const templateId = this.configService.get<string>('pancake.templateId');
    if (!templateId) {
      const error = new PancakeError(
        'Pancake template is not configured (PANCAKE_TEMPLATE_ID)',
      );
      error.retryable = false;
      throw error;
    }
    const conversationId =
      (await this.resolveConversation(to)) ?? `${this.pageId}_${to}`;
    const result = await this.api.sendTemplate(conversationId, {
      templateId,
      templateParams: { BODY_PARAMS: params },
      senderId: this.senderId,
    });
    if (!result.id) {
      throw new PancakeError('Pancake send response missing id');
    }
    return {
      providerMessageId: result.id,
      providerConversationId: conversationId,
      status: 'SENT',
    };
  }

  private async resolveConversation(to: string): Promise<string | null> {
    if (!this.resolveConversationId) {
      return null;
    }
    const wanted = digits(to);
    try {
      const { conversations } = await this.api.getConversations();
      const match = conversations.find((conversation) => {
        const fromId = digits(conversation.from?.id ?? '');
        if (fromId === wanted) {
          return true;
        }
        if (
          conversation.customers?.some(
            (customer) => digits(customer.fb_id ?? '') === wanted,
          )
        ) {
          return true;
        }
        return (
          conversation.recent_phone_numbers?.some(
            (phone) => digits(phone.phone_number ?? '') === wanted,
          ) ?? false
        );
      });
      return match?.id ?? null;
    } catch {
      // Fall back to the composed id; resolution is best-effort.
      return null;
    }
  }
}
