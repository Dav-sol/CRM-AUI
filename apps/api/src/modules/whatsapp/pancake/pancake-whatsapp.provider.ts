import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PancakePublicApi, PancakeSendTemplateInput } from './pancake.adapter';
import { PancakeError } from './pancake.client';
import { PancakeMessageTemplate } from './pancake.types';
import type {
  ProviderSendResult,
  WhatsAppProvider,
} from '../whatsapp.provider';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

// Variable names declared by the template BODY text ({{name}} placeholders).
// Meta rejects a send whose BODY parameter count does not match the template
// (error 132000), so the payload must match exactly what is declared here.
// Falls back to the published example params when the text is absent.
function declaredBodyParams(template: PancakeMessageTemplate): string[] {
  const body = (template.components ?? []).find(
    (component) => component.type === 'BODY',
  );
  const names = new Set<string>();
  for (const match of (body?.text ?? '').matchAll(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
  )) {
    names.add(match[1]);
  }
  if (names.size === 0) {
    for (const param of body?.example?.body_text_named_params ?? []) {
      if (param.param_name) {
        names.add(param.param_name);
      }
    }
  }
  return [...names];
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
  // Cache of the configured template's declared BODY variables (Botcake).
  private templateParamsCache: {
    fetchedAt: number;
    names: string[] | null;
  } | null = null;
  private static readonly TEMPLATE_PARAMS_TTL_MS = 600_000;

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

  async sendMessage(
    to: string,
    text: string,
    organizationId?: string | null,
  ): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new PancakeError('Pancake provider is not configured');
    }
    const conversationId =
      (await this.resolveConversation(to)) ?? `${this.pageId}_${to}`;
    const result = await this.api.sendInboxMessage(
      conversationId,
      text,
      this.senderId,
      organizationId,
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
    organizationId?: string | null,
  ): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new PancakeError('Pancake provider is not configured');
    }
    const result = await this.api.sendTemplate(
      conversationId,
      {
        ...input,
        senderId: input.senderId ?? this.senderId,
      },
      organizationId,
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

  // Global v1 (2026-09-10): every Pancake send (automations, manual, advisor
  // replies) goes through the single configured APPROVED template — free-text
  // InboxMessage always fails on WhatsApp (validated live). Params are named
  // BODY_PARAMS values (document.md:4246): customer_name, product_name,
  // organization_name. The template id comes from PANCAKE_TEMPLATE_ID; a
  // missing template is terminal (H5: no retry — it would fail again).
  async sendTemplate(
    to: string,
    params: Record<string, string>,
    organizationId?: string | null,
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
    const result = await this.api.sendTemplate(
      conversationId,
      {
        templateId,
        templateParams: {
          BODY_PARAMS: await this.alignBodyParams(templateId, params),
        },
        senderId: this.senderId,
      },
      organizationId,
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

  // Meta rejects a template send whose BODY params do not match the declared
  // variables (error 132000 "Template Param Count Mismatch"). Callers resolve
  // a fixed superset (customer_name, product_name, organization_name) while
  // the approved template declares its own set — live check 2026-09-25:
  // google_reseas (es_CO, APPROVED) declares customer_name + product_name
  // only. Send exactly the declared variables, filling unknown ones with ''.
  // Definitions come from Botcake and are cached; when they cannot be read,
  // the caller's params go unchanged (a definition fetch never blocks a send).
  private async alignBodyParams(
    templateId: string,
    params: Record<string, string>,
  ): Promise<Record<string, string>> {
    const declared = await this.declaredBodyParamNames(templateId);
    if (declared.length === 0) {
      return params;
    }
    const aligned: Record<string, string> = {};
    for (const name of declared) {
      aligned[name] = params[name] ?? '';
    }
    return aligned;
  }

  private async declaredBodyParamNames(templateId: string): Promise<string[]> {
    const cached = this.templateParamsCache;
    if (
      cached &&
      Date.now() - cached.fetchedAt <
        PancakeWhatsAppProvider.TEMPLATE_PARAMS_TTL_MS
    ) {
      return cached.names ?? [];
    }
    try {
      const templates = await this.api.getMessageTemplates();
      const template = templates.find((entry) => entry.id === templateId);
      // No template match → no filtering: Pancake answers "Template not found".
      this.templateParamsCache = template
        ? { fetchedAt: Date.now(), names: declaredBodyParams(template) }
        : { fetchedAt: Date.now(), names: null };
      return this.templateParamsCache.names ?? [];
    } catch {
      this.templateParamsCache = null;
      return [];
    }
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
