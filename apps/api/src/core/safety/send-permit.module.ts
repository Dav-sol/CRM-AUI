import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SendPermitGuard } from './send-permit.guard';

/**
 * Módulo global de seguridad de envíos (AUTO-SAFETY-002).
 *
 * Es global a propósito: los providers se construyen en módulos distintos
 * (pancake.module, messaging.module, whatsapp.module) y todos deben recibir la
 * dependencia de autorización sin que exista una ruta que pueda omitirla.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SendPermitGuard],
  exports: [SendPermitGuard],
})
export class SafetyModule {}
