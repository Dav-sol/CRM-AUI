import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from '../sms-provider.interface';

@Injectable()
export class NullSmsProvider implements SmsProvider {
  private readonly logger = new Logger(NullSmsProvider.name);

  send(input: SmsSendInput): Promise<SmsSendResult> {
    this.logger.log(
      `[NULL SMS] Sending to ${input.to} from ${input.from} (${input.content.length} chars)`,
    );
    return Promise.resolve({
      providerMessageId: `sms-sim-${randomUUID()}`,
      segments: 1,
      cost: 0,
      currency: 'COP',
    });
  }

  getName(): string {
    return 'NULL';
  }
}
