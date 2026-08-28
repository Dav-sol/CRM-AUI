import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PancakePublicApi, PANCAKE_PAGE_ID } from './pancake.adapter';
import {
  PANCAKE_CLIENT_CONFIG,
  PancakeClient,
  type PancakeClientConfig,
} from './pancake.client';
import { PancakeWhatsAppProvider } from './pancake-whatsapp.provider';

// Pancake integration (WhatsApp via Pancake Public API). Org-scoped and
// dormant by default: the runtime only routes to Pancake for
// PANCAKE_ORGANIZATION_ID when PANCAKE_API_TOKEN/PANCAKE_PAGE_ID are set.
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PANCAKE_CLIENT_CONFIG,
      useFactory: (config: ConfigService): PancakeClientConfig => ({
        apiToken: config.get<string>('pancake.apiToken') ?? '',
        botcakeApiToken: config.get<string>('pancake.botcakeApiToken') ?? '',
        pageId: config.get<string>('pancake.pageId') ?? '',
        apiBaseUrl: config.get<string>('pancake.apiBaseUrl') ?? '',
        templatesApiUrl: config.get<string>('pancake.templatesApiUrl') ?? '',
        timeoutMs: config.get<number>('pancake.timeoutMs'),
        minIntervalMs: config.get<number>('pancake.minIntervalMs'),
        retryOnAmbiguous: config.get<boolean>('pancake.retryOnAmbiguous'),
      }),
      inject: [ConfigService],
    },
    PancakeClient,
    {
      provide: PANCAKE_PAGE_ID,
      useFactory: (config: ConfigService): string =>
        config.get<string>('pancake.pageId') ?? '',
      inject: [ConfigService],
    },
    PancakePublicApi,
    PancakeWhatsAppProvider,
  ],
  exports: [PancakePublicApi, PancakeWhatsAppProvider],
})
export class PancakeModule {}
