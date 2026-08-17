import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';
import { MetaWhatsAppProvider } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappWebhookController', () => {
  let controller: WhatsappWebhookController;
  let service: { handleInboundPayload: jest.Mock };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    service = { handleInboundPayload: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'whatsapp.webhookVerifyToken': 'verify-token',
          'whatsapp.webhookSecret': 'secret-xyz',
        };
        return values[key] ?? null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappWebhookController],
      providers: [
        { provide: WhatsappService, useValue: service },
        MetaWhatsAppProvider,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(WhatsappWebhookController);
  });

  it('answers the verification handshake when the token matches', () => {
    const challenge = controller.verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify-token',
      'hub.challenge': '12345',
    });

    expect(challenge).toBe('12345');
  });

  it('rejects the handshake when the token mismatches', () => {
    expect(() =>
      controller.verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '12345',
      }),
    ).toThrow();
  });

  it('accepts a signed webhook body and delegates processing', async () => {
    const body = { entry: [] };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', 'secret-xyz')
      .update(raw)
      .digest('hex')}`;

    const result = await controller.receive(
      {
        headers: { 'x-hub-signature-256': signature },
        body,
      } as never,
      body,
    );

    expect(result).toEqual({ status: 'received' });
    expect(service.handleInboundPayload).toHaveBeenCalled();
  });

  it('rejects a body with an invalid signature', async () => {
    await expect(
      controller.receive(
        {
          headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
          body: { entry: [] },
        } as never,
        { entry: [] },
      ),
    ).rejects.toThrow();
  });

  it('rejects a body without a signature', async () => {
    await expect(
      controller.receive({ headers: {}, body: { entry: [] } } as never, {
        entry: [],
      }),
    ).rejects.toThrow();
  });
});
