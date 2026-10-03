import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { configuration, envValidationSchema } from './core/config';

import { PrismaModule } from './core/database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PasswordResetModule } from './modules/password-reset/password-reset.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ProductsModule } from './modules/products/products.module';
import { ImportsModule } from './modules/imports/imports.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ConfiguracionesModule } from './modules/configuraciones/configuraciones.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { FollowUpSequencesModule } from './modules/follow-up-sequences/follow-up-sequences.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MessagingModule } from './modules/messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),

    EventEmitterModule.forRoot(),

    PrismaModule,

    HealthModule,

    OrganizationsModule,

    UsersModule,

    AuthModule,

    PasswordResetModule,

    InvitationsModule,

    CustomersModule,

    PurchasesModule,

    ProductsModule,

    ImportsModule,

    AutomationsModule,

    WhatsappModule,

    ConversationsModule,
    ConfiguracionesModule,
    LifecycleModule,

    CampaignsModule,
    QuotesModule,

    FollowUpSequencesModule,

    DashboardModule,

    TemplatesModule,

    MessagesModule,

    ReportsModule,

    MessagingModule,
  ],
})
export class AppModule {}
