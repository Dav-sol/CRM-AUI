import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SmsProvider, SMS_PROVIDER } from './sms-provider.interface';
import { NullSmsProvider } from './providers/null-sms.provider';
import { AltiriaSmsProvider } from './providers/altiria-sms.provider';
import { SmsExecutionService } from './sms-execution.service';
import { SmsScheduler } from './sms-scheduler';
import { SmsWebhookController } from './sms-webhook.controller';
import { MessagingService } from './messaging.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

// AUTO-SAFETY-002: `sendPermit` is a MANDATORY constructor argument of every
// SMS transport, so no provider can be instantiated that is not behind the
// outbound authorization policy.
function smsProviderFactory(sendPermit: SendPermitGuard): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? 'NULL';
  switch (provider) {
    case 'ALTIRIA':
      return new AltiriaSmsProvider(
        {
          username: process.env.ALTIRIA_USERNAME ?? '',
          apiPassword: process.env.ALTIRIA_API_PASSWORD ?? '',
          apiUrl: process.env.SMS_API_URL ?? 'https://api.altiria.com',
          sender: process.env.SMS_SENDER,
          defaultCountryPrefix: process.env.SMS_DEFAULT_COUNTRY_PREFIX ?? '57',
          webhookBaseUrl: process.env.SMS_WEBHOOK_BASE_URL,
          webhookSecret: process.env.SMS_WEBHOOK_SECRET,
        },
        sendPermit,
      );
    case 'HABLAME':
      // TODO: implement HablameSmsProvider
      return new NullSmsProvider(sendPermit);
    case 'TWILIO':
      // TODO: implement TwilioSmsProvider
      return new NullSmsProvider(sendPermit);
    case 'VONAGE':
      // TODO: implement VonageSmsProvider
      return new NullSmsProvider(sendPermit);
    case 'BIRD':
      // TODO: implement BirdSmsProvider
      return new NullSmsProvider(sendPermit);
    case 'INFOBIP':
      // TODO: implement InfobipSmsProvider
      return new NullSmsProvider(sendPermit);
    case 'NULL':
    default:
      return new NullSmsProvider(sendPermit);
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
  ],
  controllers: [SmsWebhookController],
  providers: [
    {
      provide: SMS_PROVIDER,
      useFactory: smsProviderFactory,
      inject: [SendPermitGuard],
    },
    SmsExecutionService,
    SmsScheduler,
    MessagingService,
  ],
  exports: [SMS_PROVIDER, SmsExecutionService, MessagingService],
})
export class MessagingModule {}
