import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    void _info;
    void _context;
    void _status;
    if (err || !user) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }
    return user;
  }
}
