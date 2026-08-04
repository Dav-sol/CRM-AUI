import { Module } from '@nestjs/common';
import { PrismaModule } from './core/database/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}