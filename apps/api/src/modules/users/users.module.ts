import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSessionsService } from './user-sessions.service';

@Module({
  providers: [UsersService, UserSessionsService],
  exports: [UsersService, UserSessionsService],
})
export class UsersModule {}
