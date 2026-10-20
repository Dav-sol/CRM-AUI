import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
} from '../sms-provider.interface';
import { SendPermitGuard } from '../../../core/safety/send-permit.guard';

@Injectable()
export class NullSmsProvider implements SmsProvider {
  private readonly logger = new Logger(NullSmsProvider.name);

  // Mandatory dependency (AUTO-SAFETY-002), even though this provider makes
  // no network call: keeping the gate here means no SMS transport can be
  // added later without passing through the same policy.
  constructor(private readonly sendPermit: SendPermitGuard) {}

  // `async` a propósito: el rechazo por política debe ser siempre una promesa
  // rechazada, como en el resto de transportes. Un `throw` síncrono aquí
  // escaparía a cualquier llamador que no use `await`.
  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.sendPermit.assert(input.organizationId, 'SMS');
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
