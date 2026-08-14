import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PurchaseStatus } from '@prisma/client';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const MAX_INT = 2147483647;

@ValidatorConstraint({ name: 'invoiceNumberImmutable', async: false })
export class InvoiceNumberImmutableConstraint implements ValidatorConstraintInterface {
  validate(): boolean {
    return false;
  }

  defaultMessage(): string {
    return 'invoiceNumber is immutable and cannot be updated';
  }
}

export class UpdatePurchaseDto {
  @ValidateIf((_o, value) => value !== undefined)
  @Validate(InvoiceNumberImmutableConstraint)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  quantity?: number;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  value?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}
