import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PurchaseStatus } from '@prisma/client';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const MAX_INT = 2147483647;

export class CreatePurchaseDto {
  @IsString()
  customerId!: string;

  @IsString()
  productId!: string;

  @IsString()
  @MaxLength(50)
  invoiceNumber!: string;

  @IsDateString()
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
  @IsString()
  organizationId?: string;
}
