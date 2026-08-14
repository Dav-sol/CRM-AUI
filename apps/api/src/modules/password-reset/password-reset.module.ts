import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetTokenService } from './password-reset-token.service';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetService, PasswordResetTokenService],
  exports: [PasswordResetService, PasswordResetTokenService],
})
export class PasswordResetModule {}
