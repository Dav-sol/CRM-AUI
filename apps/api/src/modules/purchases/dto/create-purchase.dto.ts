import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PurchaseStatus } from '@prisma/client';
import { PURCHASE_DATE_INPUT_PATTERN } from '../../../common/civil-date';
import { IsPurchaseDateInput } from '../../../common/civil-date.validator';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const MAX_INT = 2147483647;

const ALLOWED_WARRANTY_MONTHS = [12, 15, 18, 24] as const;

export class CreatePurchaseDto {
  @IsString()
  customerId!: string;

  @IsString()
  productId!: string;

  @IsString()
  @MaxLength(50)
  invoiceNumber!: string;

  /**
   * Contrato de entrada (D-1). Acepta la fecha civil canónica `YYYY-MM-DD` y
   * también un instante inequívoco con zona declarada, que la frontera
   * convierte a su día civil en `America/Bogota`. Se rechaza un instante SIN
   * zona: su interpretación diferiría entre el host y el contenedor.
   */
  @Matches(PURCHASE_DATE_INPUT_PATTERN, {
    message: 'purchaseDate debe ser YYYY-MM-DD o un instante ISO 8601 con zona',
  })
  @IsPurchaseDateInput()
  purchaseDate!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_INT)
  quantity!: number;

  @Matches(MONEY_PATTERN)
  value!: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  @IsIn([...ALLOWED_WARRANTY_MONTHS])
  warrantyMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceConversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  quoteId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;
}
