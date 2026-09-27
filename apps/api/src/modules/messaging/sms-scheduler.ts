import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { SmsExecutionService } from './sms-execution.service';
import { PrismaService } from '../../core/database/prisma.service';

const TICK_MS = 60_000;
const SCHEDULER_BATCH_SIZE = 100;
const MAX_AUTOMATION_RETRIES = 3;

@Injectable()
export class SmsScheduler {
  private readonly logger = new Logger(SmsScheduler.name);

  constructor(
    private readonly executionService: SmsExecutionService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.configService.get('app.environment') === 'test') {
      return;
    }
    try {
      await this.expireStuckExecuting();
      await this.executeDueAutomations();
    } catch (error) {
      this.logger.error(
        'SMS scheduler tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async expireStuckExecuting(): Promise<void> {
    const timeoutMs =
      this.configService.get<number>('sms.executingTimeoutMs') ?? 600_000;
    if (timeoutMs <= 0) return;

    const cutoff = new Date(Date.now() - timeoutMs);
    const stuck = await this.prisma.automation.findMany({
      where: {
        status: 'EXECUTING',
        channel: 'SMS',
        updatedAt: { lt: cutoff },
        deletedAt: null,
      },
      select: { id: true },
      take: SCHEDULER_BATCH_SIZE,
    });

    for (const automation of stuck) {
      await this.prisma.automation.updateMany({
        where: { id: automation.id, status: 'EXECUTING' },
        data: { status: 'ERROR', retryCount: { increment: 1 } },
      });
    }

    if (stuck.length > 0) {
      this.logger.warn(
        `Expired ${stuck.length} stuck SMS automations back to ERROR`,
      );
    }
  }

  private async executeDueAutomations(): Promise<void> {
    const due = await this.prisma.automation.findMany({
      where: {
        channel: 'SMS',
        status: { in: ['SCHEDULED', 'ERROR'] },
        retryCount: { lt: MAX_AUTOMATION_RETRIES },
        scheduledDate: { lte: new Date() },
        deletedAt: null,
        OR: [{ campaignId: null }, { campaign: { status: 'ACTIVE' } }],
        purchase: {
          deletedAt: null,
          customer: { deletedAt: null, status: 'ACTIVE', noContactAt: null },
        },
      },
      select: { id: true, purpose: true },
      orderBy: { scheduledDate: 'asc' },
      take: SCHEDULER_BATCH_SIZE,
    });

    const now = new Date();
    const quietStart =
      this.configService.get<number>('sms.commercialQuietHoursStart') ?? 20;
    const quietEnd =
      this.configService.get<number>('sms.commercialQuietHoursEnd') ?? 9;
    const timezone =
      this.configService.get<string>('sms.timezone') ?? 'America/Bogota';

    const currentHour = this.getHourInTimezone(now, timezone);

    const isQuietHour =
      quietStart > quietEnd
        ? currentHour >= quietStart || currentHour < quietEnd
        : currentHour >= quietStart && currentHour < quietEnd;

    const toExecute: string[] = [];
    let deferred = 0;

    for (const automation of due) {
      if (automation.purpose === 'COMMERCIAL' && isQuietHour) {
        deferred++;
        continue;
      }
      toExecute.push(automation.id);
    }

    if (deferred > 0) {
      this.logger.debug(
        `SMS scheduler: deferred ${deferred} commercial automations (hour ${currentHour}, quiet ${quietStart}–${quietEnd} ${timezone})`,
      );
    }

    this.logger.debug(
      `SMS scheduler: ${toExecute.length} automations due (${deferred} deferred)`,
    );

    for (const automationId of toExecute) {
      await this.executionService.executeOneAutomation(automationId);
    }
  }

  private getHourInTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    return parseInt(formatter.format(date), 10);
  }
}
