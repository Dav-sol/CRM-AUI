import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NullSmsProvider, SMS_PROVIDER } from './sms.provider';

@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Future: instantiate TwilioSmsProvider, InfobipSmsProvider, etc.
        // For now, always use the null provider (no-op)
        void config.get<string>('sms.provider');
        return new NullSmsProvider(config);
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
