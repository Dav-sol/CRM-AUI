import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionesController } from './configuraciones.controller';
import { ConfiguracionesService } from './configuraciones.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ConfiguracionesController],
  providers: [ConfiguracionesService],
  exports: [ConfiguracionesService],
})
export class ConfiguracionesModule {}
