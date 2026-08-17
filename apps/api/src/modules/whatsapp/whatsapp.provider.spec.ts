import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppProvider, ProviderSendError } from './whatsapp.provider';

describe('MetaWhatsAppProvider', () => {
  let provider: MetaWhatsAppProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
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

    it('returns empty arrays for an empty payload', () => {
      const payload = provider.parseInbound({});
      expect(payload.messages).toEqual([]);
      expect(payload.statuses).toEqual([]);
    });
  });
});
