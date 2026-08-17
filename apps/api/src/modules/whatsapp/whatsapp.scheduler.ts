import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WhatsappService } from './whatsapp.service';

const TICK_MS = 60_000;

@Injectable()
export class WhatsappScheduler {
  private readonly logger = new Logger(WhatsappScheduler.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.configService.get('app.environment') === 'test') {
      return;
    }
    try {
      await this.whatsappService.executeDueAutomations();
    } catch (error) {
      this.logger.error(
        'scheduler tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
