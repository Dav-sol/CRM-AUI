import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WhatsappService } from './whatsapp.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

const TICK_MS = 60_000;

@Injectable()
export class WhatsappScheduler {
  private readonly logger = new Logger(WhatsappScheduler.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
    private readonly sendPermit: SendPermitGuard,
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.configService.get('app.environment') === 'test') {
      return;
    }
    // AUTO-SAFETY-002: early return under a DENIED policy. The tick selects
    // NOTHING: no `findMany`, no message row, no state transition, no
    // retryCount change and no scheduledDate change. The pending queue is
    // preserved intact for when the policy is lifted. `expireStuckExecuting`
    // is skipped too: flipping EXECUTING -> ERROR would consume a retry on a
    // send that was blocked by policy, not by a provider failure.
    const probe = this.sendPermit.evaluate(null, 'WHATSAPP');
    if (!probe.allowed) {
      this.logger.debug(
        `outbound send policy denies WhatsApp (${probe.reason}); skipping tick`,
      );
      return;
    }
    try {
      await this.whatsappService.expireStuckExecuting();
      await this.whatsappService.executeDueAutomations();
    } catch (error) {
      this.logger.error(
        'scheduler tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
