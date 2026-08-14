import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AccountType } from '@prisma/client';
import { AuthRole } from '../../modules/auth/tokens/token.service';

export interface AuthUser {
  id: string;
  uuid: string;
  accountType: AccountType;
  organizationId: string | null;
  role: AuthRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);
