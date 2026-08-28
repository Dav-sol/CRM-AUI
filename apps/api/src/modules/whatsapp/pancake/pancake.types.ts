// Types for the Pancake Public API (specs/API-Pancake/document.md).
// Only the shapes needed by the current adapter are mapped; the API returns
// far richer payloads (customer profiles, orders, etc.) that we ignore.

export interface PancakeConversation {
  id: string;
  page_id?: string;
  customer_id?: string;
  type?: string;
  status?: string;
  last_message?: string | null;
  last_message_at?: string;
  updated_at?: string;
  inserted_at?: string;
  from?: { id?: string; name?: string };
  customers?: Array<{ id?: string; fb_id?: string; name?: string }>;
  recent_phone_numbers?: Array<{ phone_number?: string }>;
}

export interface PancakeListConversationsResponse {
  conversations: PancakeConversation[];
}

export interface PancakeMessage {
  id: string;
  conversation_id?: string;
  message?: string;
  sender?: string;
  type?: string;
  created_at?: string;
  inserted_at?: string;
}

export interface PancakeMessagesResponse {
  success: boolean;
  conversation_id?: string;
  messages: PancakeMessage[];
}

export interface PancakeMessageTemplateComponent {
  type: string; // BODY | HEADER | BUTTONS | ...
  text?: string;
  example?: { body_text?: string[][] };
  buttons?: Array<{ text?: string; type?: string; url?: string }>;
}

export interface PancakeMessageTemplate {
  id: string;
  name?: string;
  status?: string; // APPROVED | PENDING | ...
  category?: string; // UTILITY | MARKETING | ...
  language?: string; // en_US | es ...
  waba_id?: string;
  parameter_format?: string | null;
  components?: PancakeMessageTemplateComponent[];
  [key: string]: unknown;
}

export interface PancakeTemplatesResponse {
  success?: boolean;
  data?: PancakeMessageTemplate[];
  [key: string]: unknown;
}

// WhatsappTemplateParams follows the Meta template format: Header, Body,
// Buttons[N]. See WhatsappTemplateParams in document.md:4229.
export type PancakeTemplateParams = {
  HEADER_PARAMS?: Record<string, unknown>;
  BODY_PARAMS?: Record<string, string>;
  [buttonIndex: `BUTTONS_${number}_PARAMS`]: Record<string, string> | undefined;
};

export interface PancakeWhatsappTemplateMessage {
  action: 'reply_inbox';
  conversation_id?: string;
  template_id: string;
  template_params?: PancakeTemplateParams;
  sender_id?: string;
}

export interface PancakeInboxMessage {
  action: 'reply_inbox';
  message: string;
  sender_id?: string;
  reply_message_id?: string;
}

export interface PancakeSendMessageResponse {
  success?: boolean;
  id?: string;
  message?: string;
}
