import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthUser; params: Record<string, string> }
      >();
    const user = request.user;
    if (!user) {
      return true;
    }
    if (user.accountType === 'PLATFORM') {
      return true;
    }

    const resourceOrganizationId = request.params.id;
    if (
      resourceOrganizationId &&
      resourceOrganizationId !== user.organizationId
    ) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Forbidden' },
      });
    }

    return true;
  }
}
