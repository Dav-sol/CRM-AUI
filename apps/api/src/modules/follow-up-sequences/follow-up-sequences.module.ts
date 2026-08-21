import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FollowUpSequencesController } from './follow-up-sequences.controller';
import { FollowUpSequencesService } from './follow-up-sequences.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FollowUpSequencesController],
  providers: [FollowUpSequencesService],
})
export class FollowUpSequencesModule {}
