import { Logger } from '@nestjs/common';
import * as https from 'https';
import { URL } from 'url';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from '../sms-provider.interface';
import { countSmsSegments } from '../sms-segments.util';
import { SendPermitGuard } from '../../../core/safety/send-permit.guard';

export interface AltiriaSmsConfig {
  username: string;
  apiPassword: string;
  apiUrl: string;
  sender?: string;
  defaultCountryPrefix: string;
  webhookBaseUrl?: string;
  webhookSecret?: string;
}

interface AltiriaErrorBody {
  error?: {
    code: number;
    description: string;
  };
}

interface AltiriaResult {
  accepted: boolean;
  to: string;
  id: string;
  parts: number;
}

interface AltiriaResponseBody {
  campaignId?: string;
  sendingId?: string;
  result?: AltiriaResult[];
}

const ALTIRIA_TIMEOUT_MS = 10_000;
const MAX_ALTIRIA_PARTS = 15;
const PHONE_NON_DIGITS = /[^0-9]/g;

export class AltiriaSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AltiriaSmsProvider.name);

  constructor(
    private readonly config: AltiriaSmsConfig,
    // Mandatory dependency (AUTO-SAFETY-002): last barrier before the HTTPS
    // request that produces the external effect.
    private readonly sendPermit: SendPermitGuard,
  ) {
    if (!config.username || !config.apiPassword) {
      throw new Error(
        'AltiriaSmsProvider: ALTIRIA_USERNAME and ALTIRIA_API_PASSWORD are required',
      );
    }
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    // Last barrier. Throws SendBlockedError, never an https error.
    this.sendPermit.assert(input.organizationId, 'SMS');
    const normalizedTo = this.normalizePhone(input.to);
    const content = input.content;
    const { segments, encoding } = countSmsSegments(content);
    const altiriaEncoding = encoding === 'GSM_7' ? 'gsm' : 'utf-16';
    const parts = Math.min(segments, MAX_ALTIRIA_PARTS);

    const payload: Record<string, unknown> = {
      to: [normalizedTo],
      message: content,
      encoding: altiriaEncoding,
      parts,
    };

    if (input.from) {
      payload.from = input.from;
    }

    if (
      this.config.webhookBaseUrl &&
      this.config.webhookSecret &&
      input.messageId
    ) {
      const params = new URLSearchParams({
        token: this.config.webhookSecret,
        messageUuid: input.messageId,
        id: '%i',
        status: '%s',
        phone: '%P',
        cost: '%c',
      });
      payload.notificationUrl = `${this.config.webhookBaseUrl}/webhooks/sms/altiria?${params.toString()}`;
    }

    const authHeader = `Basic ${Buffer.from(`${this.config.username}:${this.config.apiPassword}`).toString('base64')}`;
    const bodyStr = JSON.stringify(payload);

    this.logger.log(
      `Sending SMS via Altiria to ${normalizedTo.slice(-4)} (${parts} segments, ${altiriaEncoding})`,
    );

    const parsed = new URL(`${this.config.apiUrl}/api/rest/sms`);

    const responseBody = await new Promise<AltiriaResponseBody>(
      (resolve, reject) => {
        const req = https.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
              'Content-Length': Buffer.byteLength(bodyStr),
            },
            secureProtocol: 'TLSv1_2_method',
            timeout: ALTIRIA_TIMEOUT_MS,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk: string) => {
              data += chunk;
            });
            res.on('end', () => {
              const statusCode = res.statusCode ?? 0;

              if (
                statusCode === 400 ||
                statusCode === 401 ||
                statusCode === 402
              ) {
                try {
                  const errBody = JSON.parse(data) as AltiriaErrorBody;
                  const code = errBody.error?.code ?? -1;
                  const desc = errBody.error?.description ?? 'unknown error';
                  this.logger.error(`Altiria error ${code}: ${desc}`);
                  reject(new Error(`Altiria error ${code}: ${desc}`));
                } catch {
                  reject(new Error(`Altiria returned HTTP ${statusCode}`));
                }
                return;
              }

              if (statusCode !== 202 && statusCode !== 207) {
                this.logger.error(`Altiria HTTP ${statusCode}`);
                reject(new Error(`Altiria returned HTTP ${statusCode}`));
                return;
              }

              try {
                resolve(JSON.parse(data) as AltiriaResponseBody);
              } catch {
                reject(
                  new Error(
                    `Altiria returned invalid JSON (HTTP ${statusCode})`,
                  ),
                );
              }
            });
          },
        );

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Altiria request timeout'));
        });

        req.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
            reject(new Error('Altiria request timeout'));
          } else {
            reject(err);
          }
        });

        req.write(bodyStr);
        req.end();
      },
    );

    const result = responseBody.result?.[0];

    if (!result || !result.accepted) {
      this.logger.error(
        `Altiria rejected SMS to ${normalizedTo.slice(-4)}: accepted=${result?.accepted ?? 'no result'}`,
      );
      throw new Error(
        `Altiria rejected SMS: accepted=${result?.accepted ?? false}`,
      );
    }

    this.logger.log(
      `Altiria SMS accepted: id=${result.id} parts=${result.parts} dest=${normalizedTo.slice(-4)}`,
    );

    return {
      providerMessageId: result.id,
      segments: result.parts,
    };
  }

  getName(): string {
    return 'ALTIRIA';
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(PHONE_NON_DIGITS, '');

    if (digits.length === 10) {
      return `${this.config.defaultCountryPrefix}${digits}`;
    }

    return digits;
  }
}
