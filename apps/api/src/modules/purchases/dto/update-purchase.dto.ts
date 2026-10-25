import {
  IsEnum,
  IsIn,
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
import { PURCHASE_DATE_INPUT_PATTERN } from '../../../common/civil-date';
import { IsPurchaseDateInput } from '../../../common/civil-date.validator';
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

  /**
   * Fecha civil canónica `YYYY-MM-DD` (D-1). Ver `CreatePurchaseDto.purchaseDate`:
   * Un instante con zona declarada se convierte a su día civil en
   * `America/Bogota`; un instante sin zona se rechaza por ambiguo.
   */
  @IsOptional()
  @Matches(PURCHASE_DATE_INPUT_PATTERN, {
    message: 'purchaseDate debe ser YYYY-MM-DD o un instante ISO 8601 con zona',
  })
  @IsPurchaseDateInput()
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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  @IsIn([12, 15, 18, 24])
  warrantyMonths?: number;
}
