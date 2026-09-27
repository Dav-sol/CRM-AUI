import * as https from 'https';
import { EventEmitter } from 'events';
import { AltiriaSmsProvider } from './altiria-sms.provider';

jest.mock('https');

const ALTIRIA_CONFIG = {
  username: 'testuser',
  apiPassword: 'testpass',
  apiUrl: 'https://api.altiria.com',
  defaultCountryPrefix: '57',
  sender: '',
  webhookBaseUrl: 'https://api.example.com',
  webhookSecret: 'whsec_test123',
};

/**
 * Parsed body of the nth `https.request` call made by the provider (0-based).
 * Typed so the assertions below stay type-safe instead of walking `any`.
 */
function requestBody(callIndex: number): Record<string, unknown> {
  const request = (https.request as jest.Mock).mock.results[callIndex]
    .value as { write: { mock: { calls: [string][] } } };
  const raw = request.write.mock.calls[0][0];
  return JSON.parse(raw) as Record<string, unknown>;
}

function createMockResponse(statusCode: number, body: unknown) {
  const res = new EventEmitter();
  (res as unknown as { statusCode: number }).statusCode = statusCode;
  return { res, body: JSON.stringify(body) };
}

function setupHttpsMock(statusCode: number, body: unknown) {
  const { res, body: bodyStr } = createMockResponse(statusCode, body);
  const mockReq = new EventEmitter();
  (mockReq as unknown as { setTimeout: jest.Mock }).setTimeout = jest.fn(
    (_ms: number, cb: () => void) => {
      mockReq.on('timeout', cb);
      return mockReq;
    },
  );
  (mockReq as unknown as { destroy: jest.Mock }).destroy = jest.fn();
  (mockReq as unknown as { write: jest.Mock }).write = jest.fn();
  (mockReq as unknown as { end: jest.Mock }).end = jest.fn(() => {
    process.nextTick(() => {
      res.emit('data', bodyStr);
      res.emit('end');
    });
    return mockReq;
  });

  (https.request as jest.Mock).mockImplementation(
    (_opts: unknown, cb: (res: EventEmitter) => void) => {
      cb(res);
      return mockReq;
    },
  );

  return mockReq;
}

describe('AltiriaSmsProvider', () => {
  let provider: AltiriaSmsProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new AltiriaSmsProvider(ALTIRIA_CONFIG);
  });

  describe('constructor', () => {
    it('throws when username is missing', () => {
      expect(
        () =>
          new AltiriaSmsProvider({
            ...ALTIRIA_CONFIG,
            username: '',
          }),
      ).toThrow('ALTIRIA_USERNAME and ALTIRIA_API_PASSWORD are required');
    });

    it('throws when apiPassword is missing', () => {
      expect(
        () =>
          new AltiriaSmsProvider({
            ...ALTIRIA_CONFIG,
            apiPassword: '',
          }),
      ).toThrow('ALTIRIA_USERNAME and ALTIRIA_API_PASSWORD are required');
    });

    it('creates provider successfully with valid config', () => {
      expect(provider).toBeDefined();
      expect(provider.getName()).toBe('ALTIRIA');
    });
  });

  describe('send', () => {
    it('sends SMS successfully and returns providerMessageId + segments', async () => {
      setupHttpsMock(202, {
        campaignId: 'c123',
        sendingId: 's456',
        result: [
          {
            accepted: true,
            to: '573001234567',
            id: 'prov_id_789',
            parts: 1,
          },
        ],
      });

      const result = await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test message',
        organizationId: 'org1',
        messageId: 'msg-uuid-123',
      });

      expect(result.providerMessageId).toBe('prov_id_789');
      expect(result.segments).toBe(1);
    });

    it('sends with from field when sender is provided', async () => {
      const providerWithSender = new AltiriaSmsProvider({
        ...ALTIRIA_CONFIG,
        sender: 'MiEmpresa',
      });

      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id1', parts: 1 }],
      });

      await providerWithSender.send({
        to: '3001234567',
        from: 'MiEmpresa',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.from).toBe('MiEmpresa');
      expect(body.to).toEqual(['573001234567']);
    });

    it('omits from field when sender is empty', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id2', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.from).toBeUndefined();
    });

    it('normalizes 10-digit Colombian phone by prepending prefix', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id3', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.to).toEqual(['573001234567']);
    });

    it('normalizes phone with leading + by stripping non-digits', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id4', parts: 1 }],
      });

      await provider.send({
        to: '+573001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.to).toEqual(['573001234567']);
    });

    it('normalizes phone with spaces and dashes', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id5', parts: 1 }],
      });

      await provider.send({
        to: '300 123-4567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.to).toEqual(['573001234567']);
    });

    it('sets encoding to gsm for GSM-7 and utf-16 for non-GSM-7', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id6', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'HELLO WORLD',
        organizationId: 'org1',
      });

      const gsm = requestBody(0);
      expect(gsm.encoding).toBe('gsm');

      jest.clearAllMocks();
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id7', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: '¡Hola! ¿Qué tal?',
        organizationId: 'org1',
      });

      const utf16 = requestBody(0);
      expect(utf16.encoding).toBe('utf-16');
    });

    it('sets parts correctly based on segment count', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id8', parts: 2 }],
      });

      const longContent = 'A'.repeat(200);
      await provider.send({
        to: '3001234567',
        from: '',
        content: longContent,
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(body.parts).toBe(2);
      expect(body.encoding).toBe('gsm');
    });

    it('includes notificationUrl with messageUuid and token', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id9', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
        messageId: 'msg-uuid-abc',
      });

      const body = requestBody(0);
      expect(body.notificationUrl).toContain('token=whsec_test123');
      expect(body.notificationUrl).toContain('messageUuid=msg-uuid-abc');
      expect(body.notificationUrl).toContain('id=%25i');
      expect(body.notificationUrl).toContain('status=%25s');
    });

    it('omits notificationUrl when webhookBaseUrl is not configured', async () => {
      const providerNoWebhook = new AltiriaSmsProvider({
        ...ALTIRIA_CONFIG,
        webhookBaseUrl: '',
      });

      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id10', parts: 1 }],
      });

      await providerNoWebhook.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
        messageId: 'msg-uuid',
      });

      const body = requestBody(0);
      expect(body.notificationUrl).toBeUndefined();
    });

    it('uses Basic auth header with correct base64 encoding', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id11', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const requestMock = https.request as unknown as jest.Mock<
        EventEmitter,
        [options: unknown, cb: (res: EventEmitter) => void]
      >;
      const reqOpts = requestMock.mock.calls[0][0] as {
        headers: Record<string, string>;
      };
      const expectedAuth = `Basic ${Buffer.from('testuser:testpass').toString('base64')}`;
      expect(reqOpts.headers.Authorization).toBe(expectedAuth);
    });

    it('throws on Altiria error 103 (invalid credentials)', async () => {
      setupHttpsMock(401, {
        error: { code: 103, description: 'Invalid credentials' },
      });

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria error 103: Invalid credentials');
    });

    it('throws on Altiria error 111 (no credits)', async () => {
      setupHttpsMock(402, {
        error: { code: 111, description: 'No credits' },
      });

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria error 111: No credits');
    });

    it('throws on Altiria error 105 (message too long)', async () => {
      setupHttpsMock(400, {
        error: { code: 105, description: 'Message too long' },
      });

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria error 105: Message too long');
    });

    it('throws on non-202/207 response', async () => {
      setupHttpsMock(500, {});

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria returned HTTP 500');
    });

    it('throws when result is not accepted', async () => {
      setupHttpsMock(207, {
        result: [{ accepted: false, to: '573001234567', id: '', parts: 0 }],
      });

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria rejected SMS: accepted=false');
    });

    it('throws on request timeout', async () => {
      const mockReq = new EventEmitter();
      (mockReq as unknown as { setTimeout: jest.Mock }).setTimeout = jest.fn(
        (_ms: number, cb: () => void) => {
          mockReq.on('timeout', cb);
          return mockReq;
        },
      );
      (mockReq as unknown as { destroy: jest.Mock }).destroy = jest.fn();
      (mockReq as unknown as { write: jest.Mock }).write = jest.fn();
      (mockReq as unknown as { end: jest.Mock }).end = jest.fn(() => {
        process.nextTick(() => mockReq.emit('timeout'));
        return mockReq;
      });

      (https.request as jest.Mock).mockImplementation(
        (_opts: unknown, cb: (res: EventEmitter) => void) => {
          const res = new EventEmitter();
          (res as unknown as { statusCode: number }).statusCode = 200;
          cb(res);
          return mockReq;
        },
      );

      await expect(
        provider.send({
          to: '3001234567',
          from: '',
          content: 'Test',
          organizationId: 'org1',
        }),
      ).rejects.toThrow('Altiria request timeout');
    });

    it('never includes password in request body', async () => {
      setupHttpsMock(202, {
        result: [{ accepted: true, to: '573001234567', id: 'id12', parts: 1 }],
      });

      await provider.send({
        to: '3001234567',
        from: '',
        content: 'Test',
        organizationId: 'org1',
      });

      const body = requestBody(0);
      expect(JSON.stringify(body)).not.toContain('testpass');
      expect(JSON.stringify(body)).not.toContain('apiPassword');
    });
  });

  describe('getName', () => {
    it('returns ALTIRIA', () => {
      expect(provider.getName()).toBe('ALTIRIA');
    });
  });
});
