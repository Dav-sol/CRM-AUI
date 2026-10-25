import { ConfigService } from '@nestjs/config';
import { PancakePublicApi } from './pancake.adapter';
import { PancakeError } from './pancake.client';
import { PancakeWhatsAppProvider } from './pancake-whatsapp.provider';

function configService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('PancakeWhatsAppProvider', () => {
  it('builds the [pageID]_[phone] conversation and maps the send result', async () => {
    const sendInboxMessage = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const api = {
      sendInboxMessage,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.senderId': 'user-1',
      }),
    );

    const result = await provider.sendMessage('573001112233', 'Hola');

    expect(sendInboxMessage).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      'Hola',
      'user-1',
      undefined,
    );
    expect(result).toEqual({
      providerMessageId: 'msg-1',
      providerConversationId: 'waba_1146111635255630_573001112233',
      status: 'SENT',
    });
  });

  it('resolves the real conversation id when resolveConversationId is enabled (H4, CO. case)', async () => {
    const getConversations = jest.fn().mockResolvedValue({
      conversations: [
        {
          id: 'waba_1146111635255630_CO.1372227101779105',
          from: { id: 'wa_CO.1372227101779105' },
        },
      ],
    });
    const sendInboxMessage = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const api = {
      getConversations,
      sendInboxMessage,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.resolveConversationId': true,
      }),
    );

    const result = await provider.sendMessage('1372227101779105', 'Hola');

    expect(getConversations).toHaveBeenCalled();
    expect(sendInboxMessage).toHaveBeenCalledWith(
      'waba_1146111635255630_CO.1372227101779105',
      'Hola',
      undefined,
      undefined,
    );
    expect(result.providerConversationId).toBe(
      'waba_1146111635255630_CO.1372227101779105',
    );
  });

  it('falls back to the composed id when resolution finds no match', async () => {
    const getConversations = jest.fn().mockResolvedValue({ conversations: [] });
    const sendInboxMessage = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const api = {
      getConversations,
      sendInboxMessage,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.resolveConversationId': true,
      }),
    );

    const result = await provider.sendMessage('573001112233', 'Hola');

    expect(sendInboxMessage).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      'Hola',
      undefined,
      undefined,
    );
    // El proveedor devuelve el id del proveedor tal cual lo devolvio Pancake
    // (`providerMessageId: result.id`, `pancake-whatsapp.provider.ts`).
    expect(result).toEqual({
      providerMessageId: 'msg-1',
      providerConversationId: 'waba_1146111635255630_573001112233',
      status: 'SENT',
    });
  });

  it('sends a WhatsApp template message via sendTemplateMessage', async () => {
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      sendTemplate,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.senderId': 'user-1',
      }),
    );

    const result = await provider.sendTemplateMessage('c-1', {
      templateId: 'tpl-1',
      templateParams: { BODY_PARAMS: { customer_name: 'Ana' } },
    });

    expect(sendTemplate).toHaveBeenCalledWith(
      'c-1',
      {
        templateId: 'tpl-1',
        templateParams: { BODY_PARAMS: { customer_name: 'Ana' } },
        senderId: 'user-1',
      },
      undefined,
    );
    expect(result.providerMessageId).toBe('msg-tpl');
  });

  it('sendTemplate composes the conversation from the phone and uses the configured template', async () => {
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      sendTemplate,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.senderId': 'user-1',
        'pancake.templateId': 'tpl-global',
      }),
    );

    const result = await provider.sendTemplate('573001112233', {
      customer_name: 'Ana',
      product_name: '',
      organization_name: 'Org Uno',
    });

    expect(sendTemplate).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      {
        templateId: 'tpl-global',
        templateParams: {
          BODY_PARAMS: {
            customer_name: 'Ana',
            product_name: '',
            organization_name: 'Org Uno',
          },
        },
        senderId: 'user-1',
      },
      undefined,
    );
    expect(result).toEqual({
      providerMessageId: 'msg-tpl',
      providerConversationId: 'waba_1146111635255630_573001112233',
      status: 'SENT',
    });
  });

  it('sendTemplate resolves the real conversation id when enabled (H4)', async () => {
    const getConversations = jest.fn().mockResolvedValue({
      conversations: [
        {
          id: 'waba_1146111635255630_CO.1372227101779105',
          from: { id: 'wa_CO.1372227101779105' },
        },
      ],
    });
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      getConversations,
      sendTemplate,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.templateId': 'tpl-global',
        'pancake.resolveConversationId': true,
      }),
    );

    await provider.sendTemplate('1372227101779105', { customer_name: 'Ana' });

    expect(sendTemplate).toHaveBeenCalledWith(
      'waba_1146111635255630_CO.1372227101779105',
      expect.objectContaining({ templateId: 'tpl-global' }),
      undefined,
    );
  });

  it('sendTemplate fails terminally without PANCAKE_TEMPLATE_ID (H5)', async () => {
    const sendTemplate = jest.fn();
    const api = {
      sendTemplate,
    } as unknown as PancakePublicApi;
    const provider = new PancakeWhatsAppProvider(
      api,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
      }),
    );

    await expect(
      provider.sendTemplate('573001112233', {}),
    ).rejects.toMatchObject({ retryable: false });
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('sendTemplate aligns BODY_PARAMS with the template declared variables (Meta 132000)', async () => {
    const getMessageTemplates = jest.fn().mockResolvedValue([
      {
        id: 'tpl-global',
        name: 'google_reseas',
        status: 'APPROVED',
        components: [
          {
            type: 'BODY',
            text: 'Hola {{customer_name}}, gracias por tu compra de {{product_name}}.',
          },
        ],
      },
    ]);
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      getMessageTemplates,
      sendTemplate,
    };
    const provider = new PancakeWhatsAppProvider(
      api as unknown as PancakePublicApi,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.templateId': 'tpl-global',
      }),
    );

    await provider.sendTemplate('573001112233', {
      customer_name: 'Ana',
      product_name: 'Bateria XP',
      organization_name: 'Org Uno',
    });

    // organization_name is not declared by the template: sending it would
    // change the parameter count and Meta rejects the send.
    expect(sendTemplate).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      expect.objectContaining({
        templateParams: {
          BODY_PARAMS: {
            customer_name: 'Ana',
            product_name: 'Bateria XP',
          },
        },
      }),
      undefined,
    );
  });

  it('sendTemplate fills declared variables the caller did not resolve', async () => {
    const getMessageTemplates = jest.fn().mockResolvedValue([
      {
        id: 'tpl-global',
        components: [
          { type: 'BODY', text: '{{customer_name}} / {{product_name}}' },
        ],
      },
    ]);
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      getMessageTemplates,
      sendTemplate,
    };
    const provider = new PancakeWhatsAppProvider(
      api as unknown as PancakePublicApi,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.templateId': 'tpl-global',
      }),
    );

    await provider.sendTemplate('573001112233', { customer_name: 'Ana' });

    expect(sendTemplate).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      expect.objectContaining({
        templateParams: {
          BODY_PARAMS: { customer_name: 'Ana', product_name: '' },
        },
      }),
      undefined,
    );
  });

  it('sendTemplate keeps the caller params when definitions cannot be read', async () => {
    const getMessageTemplates = jest.fn().mockRejectedValue(new Error('down'));
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      getMessageTemplates,
      sendTemplate,
    };
    const provider = new PancakeWhatsAppProvider(
      api as unknown as PancakePublicApi,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.templateId': 'tpl-global',
      }),
    );

    await expect(
      provider.sendTemplate('573001112233', {
        customer_name: 'Ana',
        product_name: 'Bateria XP',
        organization_name: 'Org Uno',
      }),
    ).resolves.toMatchObject({ providerMessageId: 'msg-tpl' });

    // A definition fetch problem must never block the send itself.
    expect(sendTemplate).toHaveBeenCalledWith(
      'waba_1146111635255630_573001112233',
      expect.objectContaining({
        templateParams: {
          BODY_PARAMS: {
            customer_name: 'Ana',
            product_name: 'Bateria XP',
            organization_name: 'Org Uno',
          },
        },
      }),
      undefined,
    );
  });

  it('sendTemplate caches template definitions across sends', async () => {
    const getMessageTemplates = jest
      .fn()
      .mockResolvedValue([
        { id: 'tpl-global', components: [{ type: 'BODY', text: '{{a}}' }] },
      ]);
    const sendTemplate = jest.fn().mockResolvedValue({ id: 'msg-tpl' });
    const api = {
      getMessageTemplates,
      sendTemplate,
    };
    const provider = new PancakeWhatsAppProvider(
      api as unknown as PancakePublicApi,
      configService({
        'pancake.apiToken': 'tok',
        'pancake.pageId': 'waba_1146111635255630',
        'pancake.templateId': 'tpl-global',
      }),
    );

    await provider.sendTemplate('573001112233', { a: '1' });
    await provider.sendTemplate('573001112234', { a: '2' });

    expect(getMessageTemplates).toHaveBeenCalledTimes(1);
  });

  it('reports isConfigured() false without credentials', () => {
    const provider = new PancakeWhatsAppProvider(
      {} as PancakePublicApi,
      configService({}),
    );
    expect(provider.isConfigured()).toBe(false);
  });

  it('isConfigured() true only with token and page id', () => {
    const provider = new PancakeWhatsAppProvider(
      {} as PancakePublicApi,
      configService({ 'pancake.apiToken': 'tok', 'pancake.pageId': 'p1' }),
    );
    expect(provider.isConfigured()).toBe(true);
  });

  it('throws PancakeError when called without configuration', async () => {
    const provider = new PancakeWhatsAppProvider(
      {} as PancakePublicApi,
      configService({}),
    );
    await expect(
      provider.sendMessage('573001112233', 'Hola'),
    ).rejects.toBeInstanceOf(PancakeError);
  });
});
