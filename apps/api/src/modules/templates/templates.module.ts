import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AuditIdentityService } from '../auth/audit.identity.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, AuditIdentityService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
