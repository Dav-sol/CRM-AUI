import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionesModule } from '../configuraciones/configuraciones.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfiguracionesModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
