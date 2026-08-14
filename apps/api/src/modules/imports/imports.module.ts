import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsProcessor } from './imports.processor';
import { FileValidatorService } from './file-validator.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsProcessor, FileValidatorService],
})
export class ImportsModule {}
