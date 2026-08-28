import { Inject, Injectable } from '@nestjs/common';
import { PancakeClient } from './pancake.client';
import {
  PancakeInboxMessage,
  PancakeListConversationsResponse,
  PancakeMessageTemplate,
  PancakeMessagesResponse,
  PancakeSendMessageResponse,
  PancakeTemplatesResponse,
  PancakeTemplateParams,
  PancakeWhatsappTemplateMessage,
} from './pancake.types';

export const PANCAKE_PAGE_ID = Symbol('PANCAKE_PAGE_ID');

export interface PancakeListConversationsParams {
  lastConversationId?: string;
  type?: string;
  since?: number;
  until?: number;
  unreadFirst?: boolean;
  orderBy?: 'inserted_at' | 'updated_at';
}

export interface PancakeSendTemplateInput {
  templateId: string;
  templateParams?: PancakeTemplateParams;
  senderId?: string;
  conversationIdOverride?: string;
}

// High-level facade over the Pancake Public API (specs/API-Pancake/document.md).
@Injectable()
export class PancakePublicApi {
  constructor(
    private readonly client: PancakeClient,
    @Inject(PANCAKE_PAGE_ID) private readonly pageId: string,
  ) {}

  private get v1(): string {
    return `${this.client.baseUrl}/v1`;
  }

  private get v2(): string {
    return `${this.client.baseUrl}/v2`;
  }

  // GET /v2/pages/{page_id}/conversations (document.md:270)
  async getConversations(
    params: PancakeListConversationsParams = {},
  ): Promise<PancakeListConversationsResponse> {
    return this.client.get<PancakeListConversationsResponse>(
      `/pages/${this.pageId}/conversations`,
      this.v2,
      {
        last_conversation_id: params.lastConversationId,
        type: params.type,
        since: params.since,
        until: params.until,
        unread_first: params.unreadFirst,
        order_by: params.orderBy,
      },
    );
  }

  // GET /v1/pages/{page_id}/conversations/{conversation_id}/messages
  // (document.md:597). current_count = index to retrieve messages before.
  async getConversationMessages(
    conversationId: string,
    currentCount?: number,
  ): Promise<PancakeMessagesResponse> {
    return this.client.get<PancakeMessagesResponse>(
      `/pages/${this.pageId}/conversations/${conversationId}/messages`,
      this.v1,
      { current_count: currentCount },
    );
  }

  // GET {templatesApiUrl}/pages/{page_id}/message_templates (botcake.io).
  // Auth: `Authorization: Bearer <PANCAKE_BOTCAKE_API_TOKEN>` (validated live).
  // Response shape: { success: true, data: [ { id, name, status, category,
  // language, waba_id, components } ] }.
  async getMessageTemplates(): Promise<PancakeMessageTemplate[]> {
    const response = await this.client.getBearer<PancakeTemplatesResponse>(
      `/pages/${this.pageId}/message_templates`,
    );
    return response.data ?? [];
  }

  // POST /v1/pages/{page_id}/conversations/{conversation_id}/messages with a
  // WhatsappTemplateMessage (document.md:4202). MANUAL-VALIDATION: requires a
  // live check of sender_id/template_params against Pancake before production.
  async sendTemplate(
    conversationId: string,
    input: PancakeSendTemplateInput,
  ): Promise<PancakeSendMessageResponse> {
    const payload = this.buildWhatsappTemplateMessage(conversationId, input);
    return this.client.post<PancakeSendMessageResponse>(
      `/pages/${this.pageId}/conversations/${conversationId}/messages`,
      payload,
      this.v1,
    );
  }

  // Pure builder, fully testable. conversation_id is optional in the payload
  // (document.md:4214): it lets you send to a NEW phone number by composing
  // "[pageID]_[phoneNumber]".
  buildWhatsappTemplateMessage(
    conversationId: string,
    input: PancakeSendTemplateInput,
  ): PancakeWhatsappTemplateMessage {
    const message: PancakeWhatsappTemplateMessage = {
      action: 'reply_inbox',
      template_id: input.templateId,
    };
    if (input.templateParams) {
      message.template_params = input.templateParams;
    }
    if (input.senderId) {
      message.sender_id = input.senderId;
    }
    if (input.conversationIdOverride) {
      message.conversation_id = input.conversationIdOverride;
    } else {
      message.conversation_id = conversationId;
    }
    return message;
  }

  // POST InboxMessage (text) used by the WhatsAppProvider drop-in
  // (document.md:4101).
  async sendInboxMessage(
    conversationId: string,
    text: string,
    senderId?: string,
  ): Promise<PancakeSendMessageResponse> {
    const payload: PancakeInboxMessage = {
      action: 'reply_inbox',
      message: text,
    };
    if (senderId) {
      payload.sender_id = senderId;
    }
    return this.client.post<PancakeSendMessageResponse>(
      `/pages/${this.pageId}/conversations/${conversationId}/messages`,
      payload,
      this.v1,
    );
  }
}
