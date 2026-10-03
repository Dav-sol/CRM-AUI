import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LifecycleService } from './lifecycle.service';

/**
 * Lifecycle de postventa (spec 025). Solo expone servicio: la API de
 * configuración de lifecycle entra más adelante, cuando lo que queda pendiente
 * (PD-1, PD-6, PD-7, PD-8) no condicione su forma.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
