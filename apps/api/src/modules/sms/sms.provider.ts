import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  providerMessageId: string;
  status: 'SENT';
}

export interface SmsProvider {
  sendMessage(to: string, text: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

@Injectable()
export class NullSmsProvider implements SmsProvider {
  private readonly logger = new Logger(NullSmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  sendMessage(to: string, text: string): Promise<SmsSendResult> {
    this.logger.warn(
      `SMS provider not configured. Message to ${to} not sent (${text.length} chars).`,
    );
    return Promise.resolve({
      providerMessageId: `sms-sim-${Date.now()}`,
      status: 'SENT' as const,
    });
  }
}
