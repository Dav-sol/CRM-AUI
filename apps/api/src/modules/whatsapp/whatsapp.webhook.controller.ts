import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { MetaWhatsAppProvider } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly provider: MetaWhatsAppProvider,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  verify(@Query() query: Record<string, string>): string {
    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expected =
      this.configService.get<string>('whatsapp.webhookVerifyToken') ?? '';
    if (mode === 'subscribe' && verifyToken && verifyToken === expected) {
      return challenge ?? 'ok';
    }
    throw new ForbiddenException({
      error: {
        code: 'INVALID_VERIFY_TOKEN',
        message: 'Invalid webhook verification token',
      },
    });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<{ status: 'received' }> {
    const signature = request.headers['x-hub-signature-256'] as
      string | undefined;
    if (!signature) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_SIGNATURE', message: 'Missing signature' },
      });
    }

    const rawBody = this.rawBody(request);
    if (!this.provider.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' },
      });
    }

    try {
      const payload = this.provider.parseInbound(body);
      await this.whatsappService.handleInboundPayload(payload);
    } catch (error) {
      this.logger.error(
        'webhook processing failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { status: 'received' };
  }

  private rawBody(request: Request): Buffer {
    const raw = (request as Request & { rawBody?: Buffer }).rawBody;
    if (raw) {
      return raw;
    }
    return Buffer.from(JSON.stringify(request.body ?? {}));
  }
}
