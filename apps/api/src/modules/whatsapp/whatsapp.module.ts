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

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule, ScheduleModule.forRoot()],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [
    WhatsappService,
    MetaWhatsAppProvider,
    { provide: WHATSAPP_PROVIDER, useExisting: MetaWhatsAppProvider },
    WhatsappScheduler,
  ],
})
export class WhatsappModule {}
