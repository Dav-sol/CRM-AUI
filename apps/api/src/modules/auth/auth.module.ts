import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { TokenService } from './tokens/token.service';
import { RefreshTokenHasher } from './tokens/refresh-token-hasher';
import { AuditIdentityService } from './audit.identity.service';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RefreshTokenHasher,
    JwtStrategy,
    JwtRefreshStrategy,
    AuditIdentityService,
  ],
  exports: [
    AuthService,
    TokenService,
    RefreshTokenHasher,
    AuditIdentityService,
  ],
})
export class AuthModule {}
