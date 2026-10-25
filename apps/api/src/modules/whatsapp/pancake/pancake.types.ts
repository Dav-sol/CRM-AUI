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

/**
 * Message (document.md:3848). El tipo anterior (`sender`, `created_at`) no
 * coincidía con el contrato publicado y hacía imposible validar cualquier
 * mapeo de entrada: el esquema real expone `from`, `original_message`,
 * `inserted_at`, `seen` e `is_removed`.
 */
export interface PancakeMessageSender {
  /** Facebook ID / PSID del emisor. NO es un teléfono. */
  id?: string;
  name?: string;
  /** `Pancake user UUID when sent by a staff member`. */
  uid?: string | null;
  /** `ID of the admin/staff account that sent the message`. */
  admin_id?: string | null;
  admin_name?: string | null;
}

export interface PancakeMessage {
  id: string;
  conversation_id?: string;
  page_id?: string;
  /** Canal: `INBOX` | `COMMENT` | `LIVESTREAM`. */
  type?: string;
  /** Contenido renderizado; puede contener HTML (solo-imagen → `<div></div>`). */
  message?: string;
  /** Texto original sin renderizar. Preferente para persistir. */
  original_message?: string;
  from?: PancakeMessageSender;
  inserted_at?: string;
  /** Si el mensaje ha sido visto. */
  seen?: boolean;
  /** Si el mensaje fue eliminado. */
  is_removed?: boolean;
}

/**
 * page_customer (document.md:1644). Es la ÚNICA vía documentada que asocia un
 * `psid` con un número de teléfono: el esquema `Conversation` solo declara
 * `has_phone` (booleano) y `conv_phone_numbers` (detectados, no canónicos).
 */
export interface PancakePageCustomer {
  id?: string;
  /** Page-scoped user ID. */
  psid?: string;
  name?: string;
  /** Lista de teléfonos, `items: string` (document.md:1761). */
  phone_numbers?: string[];
}

export interface PancakePageCustomersResponse {
  total?: number;
  customers?: PancakePageCustomer[];
}

export interface PancakeMessagesResponse {
  success: boolean;
  conversation_id?: string;
  messages: PancakeMessage[];
}

export interface PancakeMessageTemplateComponent {
  type: string; // BODY | HEADER | BUTTONS | ...
  text?: string;
  example?: {
    body_text?: string[][];
    // Named BODY params published by Botcake (validated live 2026-09-25).
    body_text_named_params?: Array<{ param_name?: string; example?: string }>;
  };
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
