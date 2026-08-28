import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';
import { WhatsappScheduler } from './whatsapp.scheduler';
import { WhatsappService } from './whatsapp.service';
import { MetaWhatsAppProvider, WHATSAPP_PROVIDER } from './whatsapp.provider';
import { PancakeModule } from './pancake/pancake.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    PancakeModule,
  ],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [
    WhatsappService,
    MetaWhatsAppProvider,
    { provide: WHATSAPP_PROVIDER, useExisting: MetaWhatsAppProvider },
    WhatsappScheduler,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
