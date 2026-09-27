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

function smsProviderFactory(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? 'NULL';
  switch (provider) {
    case 'ALTIRIA':
      return new AltiriaSmsProvider({
        username: process.env.ALTIRIA_USERNAME ?? '',
        apiPassword: process.env.ALTIRIA_API_PASSWORD ?? '',
        apiUrl: process.env.SMS_API_URL ?? 'https://api.altiria.com',
        sender: process.env.SMS_SENDER,
        defaultCountryPrefix: process.env.SMS_DEFAULT_COUNTRY_PREFIX ?? '57',
        webhookBaseUrl: process.env.SMS_WEBHOOK_BASE_URL,
        webhookSecret: process.env.SMS_WEBHOOK_SECRET,
      });
    case 'HABLAME':
      // TODO: implement HablameSmsProvider
      return new NullSmsProvider();
    case 'TWILIO':
      // TODO: implement TwilioSmsProvider
      return new NullSmsProvider();
    case 'VONAGE':
      // TODO: implement VonageSmsProvider
      return new NullSmsProvider();
    case 'BIRD':
      // TODO: implement BirdSmsProvider
      return new NullSmsProvider();
    case 'INFOBIP':
      // TODO: implement InfobipSmsProvider
      return new NullSmsProvider();
    case 'NULL':
    default:
      return new NullSmsProvider();
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
    },
    SmsExecutionService,
    SmsScheduler,
    MessagingService,
  ],
  exports: [SMS_PROVIDER, SmsExecutionService, MessagingService],
})
export class MessagingModule {}
