import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EligibilityService } from './eligibility.service';
import { LifecycleService } from './lifecycle.service';

/**
 * Lifecycle de postventa (spec 025). Expone LifecycleService (estado del ciclo)
 * y EligibilityService (los gates transversales de envío, único lugar donde
 * viven). La API entra más adelante, cuando lo pendiente (PD-1, PD-6, PD-7,
 * PD-8) no condicione su forma.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [LifecycleService, EligibilityService],
  exports: [LifecycleService, EligibilityService],
})
export class LifecycleModule {}
