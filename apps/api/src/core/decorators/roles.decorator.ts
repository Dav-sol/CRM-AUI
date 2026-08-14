import { SetMetadata } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { AuthRole } from '../../modules/auth/tokens/token.service';

export const ROLES_KEY = 'identity:roles';
export const ACCOUNT_TYPES_KEY = 'identity:accountTypes';

export const Roles = (...roles: AuthRole[]) => SetMetadata(ROLES_KEY, roles);
export const AccountTypes = (...accountTypes: AccountType[]) =>
  SetMetadata(ACCOUNT_TYPES_KEY, accountTypes);
