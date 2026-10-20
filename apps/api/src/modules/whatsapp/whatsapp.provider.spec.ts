import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppProvider, ProviderSendError } from './whatsapp.provider';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';
import { SendBlockedError } from '../../core/safety/send-permit';

describe('MetaWhatsAppProvider', () => {
  let provider: MetaWhatsAppProvider;
  let configService: { get: jest.Mock };
  // AUTO-SAFETY-002: default permissive so pre-existing assertions hold. The
  // DENY behaviour is asserted explicitly further down.
  let permit: { assert: jest.Mock; evaluate: jest.Mock };

  // AUTO-SAFETY-002
  describe('política de salida (fail-closed)', () => {
    function deniedPermit() {
      return {
        assert: jest.fn(() => {
          throw new SendBlockedError('SWITCH_DENIED', 'WHATSAPP');
        }),
        evaluate: jest.fn(() => ({
          allowed: false,
          reason: 'SWITCH_DENIED' as const,
        })),
      };
    }

    it('no ejecuta fetch cuando la política deniega', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock;
      const denied = deniedPermit();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaWhatsAppProvider,
          { provide: ConfigService, useValue: configService },
          { provide: SendPermitGuard, useValue: denied },
        ],
      }).compile();
      const guarded = module.get(MetaWhatsAppProvider);

      await expect(
        guarded.sendMessage('573000000000', 'Hola', 'org-1'),
      ).rejects.toBeInstanceOf(SendBlockedError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(denied.assert).toHaveBeenCalledWith('org-1', 'WHATSAPP');
    });

    it('sin organizationId el permiso no puede concederse y se bloquea', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock;
      const strict = {
        assert: jest.fn((org: string | null | undefined) => {
          if (!org) {
            throw new SendBlockedError('ORG_MISSING', 'WHATSAPP');
          }
        }),
        evaluate: jest.fn(() => ({ allowed: false, reason: 'ORG_MISSING' })),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetaWhatsAppProvider,
          { provide: ConfigService, useValue: configService },
          { provide: SendPermitGuard, useValue: strict },
        ],
      }).compile();
      const guarded = module.get(MetaWhatsAppProvider);

      await expect(
        guarded.sendMessage('573000000000', 'Hola'),
      ).rejects.toBeInstanceOf(SendBlockedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  beforeEach(async () => {
    permit = {
      assert: jest.fn(),
      evaluate: jest.fn(() => ({ allowed: true })),
    };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'whatsapp.apiToken': 'token-abc',
          'whatsapp.phoneNumberId': 'phone-123',
          'whatsapp.apiUrl': 'https://graph.facebook.com/v21.0',
          'whatsapp.webhookSecret': 'secret-xyz',
          'whatsapp.webhookVerifyToken': 'verify-token',
        };
        return values[key] ?? null;
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaWhatsAppProvider,
        { provide: ConfigService, useValue: configService },
        { provide: SendPermitGuard, useValue: permit },
      ],
    }).compile();
    provider = module.get(MetaWhatsAppProvider);
  });

  describe('sendMessage', () => {
    it('calls the provider endpoint with auth and returns the message id', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            messages: [{ id: 'wamid-1' }],
            contacts: [{ wa_id: '573000000000' }],
          }),
      });
      (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

      const result = await provider.sendMessage('573000000000', 'Hola');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/phone-123/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer token-abc',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '573000000000',
            type: 'text',
            text: { body: 'Hola' },
          }),
        }),
      );
      expect(result).toEqual({
        providerMessageId: 'wamid-1',
        providerConversationId: '573000000000',
        status: 'SENT',
      });
    });

    it('throws ProviderSendError on non-ok provider response', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{}'),
      });
      (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

      await expect(provider.sendMessage('57', 'x')).rejects.toBeInstanceOf(
        ProviderSendError,
      );
    });

    it('throws ProviderSendError on network failure', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('net down'));
      (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

      await expect(provider.sendMessage('57', 'x')).rejects.toBeInstanceOf(
        ProviderSendError,
      );
    });

    it('throws ProviderSendError when the response lacks a message id', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messages: [] }),
      });
      (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

      await expect(provider.sendMessage('57', 'x')).rejects.toBeInstanceOf(
        ProviderSendError,
      );
    });
  });

  describe('verifySignature', () => {
    it('accepts a valid HMAC signature', () => {
      const body = Buffer.from('{"hello":"world"}');
      const expected = `sha256=${createHmac('sha256', 'secret-xyz')
        .update(body)
        .digest('hex')}`;
      expect(provider.verifySignature(body, expected)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const body = Buffer.from('{"hello":"world"}');
      expect(provider.verifySignature(body, 'sha256=deadbeef')).toBe(false);
    });

    it('rejects a missing signature', () => {
      expect(provider.verifySignature(Buffer.from('{}'), undefined)).toBe(
        false,
      );
    });
  });

  describe('parseInbound', () => {
    it('extracts inbound messages', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.inbound.1',
                      from: '573000000000',
                      text: { body: 'Hola empresa' },
                      timestamp: '1755000000',
                      conversation: { id: 'conv-1' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(payload.messages).toEqual([
        {
          providerMessageId: 'wamid.inbound.1',
          from: '573000000000',
          text: 'Hola empresa',
          timestamp: '1755000000',
          providerConversationId: 'conv-1',
        },
      ]);
      expect(payload.statuses).toEqual([]);
    });

    it('extracts status updates', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    {
                      id: 'wamid.out.1',
                      status: 'DELIVERED',
                      timestamp: '1755000001',
                      conversation: { id: 'conv-1' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(payload.statuses).toEqual([
        {
          providerMessageId: 'wamid.out.1',
          status: 'DELIVERED',
          timestamp: '1755000001',
          providerConversationId: 'conv-1',
        },
      ]);
      expect(payload.messages).toEqual([]);
    });

    it('normalizes an affirmative button_reply without inferring meaning', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.inbound.btn.1',
                      from: '573000000000',
                      timestamp: '1755000000',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'review-consent-yes',
                          title: 'Sí, activar',
                        },
                      },
                      context: { id: 'wamid.out.review.1' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      // Transporte únicamente: el botón se normaliza y persiste. La decisión
      // de negocio (qué significa "sí") pertenece al lifecycle, no al provider.
      expect(payload.messages).toEqual([
        {
          providerMessageId: 'wamid.inbound.btn.1',
          from: '573000000000',
          text: '',
          timestamp: '1755000000',
          providerConversationId: null,
          buttonId: 'review-consent-yes',
          buttonTitle: 'Sí, activar',
          inReplyToProviderId: 'wamid.out.review.1',
        },
      ]);
    });

    it('normalizes a negative button_reply the same way', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.inbound.btn.2',
                      from: '573000000000',
                      timestamp: '1755000000',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: { id: 'review-consent-no', title: 'No' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(payload.messages).toEqual([
        {
          providerMessageId: 'wamid.inbound.btn.2',
          from: '573000000000',
          text: '',
          timestamp: '1755000000',
          providerConversationId: null,
          buttonId: 'review-consent-no',
          buttonTitle: 'No',
        },
      ]);
    });

    it('ignores unknown interactive types instead of inferring meaning', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.inbound.lst.1',
                      from: '573000000000',
                      timestamp: '1755000000',
                      type: 'interactive',
                      interactive: {
                        type: 'list_reply',
                        list_reply: { id: 'opt-1', title: 'Opción 1' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(payload.messages).toEqual([
        {
          providerMessageId: 'wamid.inbound.lst.1',
          from: '573000000000',
          text: '',
          timestamp: '1755000000',
          providerConversationId: null,
        },
      ]);
    });

    it('drops malformed button payloads without throwing', () => {
      const payload = provider.parseInbound({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.inbound.bad.1',
                      from: '573000000000',
                      timestamp: '1755000000',
                      type: 'interactive',
                      interactive: { type: 'button_reply' },
                    },
                    {
                      id: 'wamid.inbound.bad.2',
                      from: '573000000000',
                      timestamp: '1755000000',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: { id: '', title: 42 },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(payload.messages).toEqual([
        {
          providerMessageId: 'wamid.inbound.bad.1',
          from: '573000000000',
          text: '',
          timestamp: '1755000000',
          providerConversationId: null,
        },
        {
          providerMessageId: 'wamid.inbound.bad.2',
          from: '573000000000',
          text: '',
          timestamp: '1755000000',
          providerConversationId: null,
        },
      ]);
    });

    it('returns empty arrays for an empty payload', () => {
      const payload = provider.parseInbound({});
      expect(payload.messages).toEqual([]);
      expect(payload.statuses).toEqual([]);
    });
  });
});
