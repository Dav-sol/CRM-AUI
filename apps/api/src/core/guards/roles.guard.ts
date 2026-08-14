import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccountType } from '@prisma/client';
import { AuthRole } from '../../modules/auth/tokens/token.service';
import { ACCOUNT_TYPES_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AuthRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAccountTypes = this.reflector.getAllAndOverride<
      AccountType[]
    >(ACCOUNT_TYPES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles && !requiredAccountTypes) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException();
    }

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException();
    }
    if (
      requiredAccountTypes &&
      !requiredAccountTypes.includes(user.accountType)
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
