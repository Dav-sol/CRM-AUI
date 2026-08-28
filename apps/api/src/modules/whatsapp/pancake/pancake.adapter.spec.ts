import { PancakeClient, type PancakeClientConfig } from './pancake.client';
import { PancakePublicApi } from './pancake.adapter';

const CONFIG: PancakeClientConfig = {
  apiToken: 'tok-secret',
  botcakeApiToken: 'tok-secret',
  pageId: 'waba_1146111635255630',
  apiBaseUrl: 'https://pages.fm/api/public_api',
  templatesApiUrl: 'https://botcake.io/api/public_api/v1',
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

describe('PancakePublicApi', () => {
  let client: PancakeClient;
  let api: PancakePublicApi;

  beforeEach(() => {
    client = new PancakeClient({ ...CONFIG });
    api = new PancakePublicApi(client, CONFIG.pageId);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it('lists conversations against the v2 endpoint with mapped params', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ conversations: [{ id: 'c-1' }] }),
    );
    const result = await api.getConversations({
      lastConversationId: 'c-9',
      unreadFirst: true,
    });
    expect(result.conversations[0].id).toBe('c-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('GET');
    expect(String(url)).toContain(
      '/v2/pages/waba_1146111635255630/conversations',
    );
    expect(String(url)).toContain('last_conversation_id=c-9');
  });

  it('gets messages from the v1 endpoint with current_count', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, messages: [{ id: 'm-1' }] }),
    );
    const result = await api.getConversationMessages('c-1', 30);
    expect(result.messages[0].id).toBe('m-1');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain(
      '/v1/pages/waba_1146111635255630/conversations/c-1/messages',
    );
    expect(String(url)).toContain('current_count=30');
  });

  it('gets message templates from the botcake host via Bearer and maps response.data', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, data: [{ id: 't-1' }] }),
    );
    const result = await api.getMessageTemplates();
    expect(result[0].id).toBe('t-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain(
      'https://botcake.io/api/public_api/v1/pages/waba_1146111635255630/message_templates',
    );
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-secret' });
  });

  it('builds a WhatsappTemplateMessage with the documented shape', () => {
    const message = api.buildWhatsappTemplateMessage('c-1', {
      templateId: 'tpl-1',
      templateParams: {
        BODY_PARAMS: { customer_name: 'Ana' },
        BUTTONS_0_PARAMS: { '{{order_id}}': 'A1' },
      },
      senderId: 'user-1',
    });
    expect(message).toEqual({
      action: 'reply_inbox',
      conversation_id: 'c-1',
      template_id: 'tpl-1',
      template_params: {
        BODY_PARAMS: { customer_name: 'Ana' },
        BUTTONS_0_PARAMS: { '{{order_id}}': 'A1' },
      },
      sender_id: 'user-1',
    });
  });

  it('supports a conversation_id override for new phone numbers', () => {
    const message = api.buildWhatsappTemplateMessage('ignored', {
      templateId: 'tpl-1',
      conversationIdOverride: 'waba_1146111635255630_573001112233',
    });
    expect(message.conversation_id).toBe('waba_1146111635255630_573001112233');
    expect(message.template_id).toBe('tpl-1');
  });

  it('sends a template via POST to the conversation messages endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, id: 'msg-1' }),
    );
    const result = await api.sendTemplate('c-1', {
      templateId: 'tpl-1',
      templateParams: { BODY_PARAMS: { customer_name: 'Ana' } },
      senderId: 'user-1',
    });
    expect(result.id).toBe('msg-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      action: 'reply_inbox',
      template_id: 'tpl-1',
      sender_id: 'user-1',
    });
    expect(String(url)).toContain(
      '/v1/pages/waba_1146111635255630/conversations/c-1/messages',
    );
  });

  it('sends an inbox text message with the InboxMessage shape', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ success: true, id: 'msg-2' }),
    );
    const result = await api.sendInboxMessage(
      'waba_1146111635255630_573001112233',
      'Hola',
      'user-1',
    );
    expect(result.id).toBe('msg-2');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      action: 'reply_inbox',
      message: 'Hola',
      sender_id: 'user-1',
    });
  });
});
