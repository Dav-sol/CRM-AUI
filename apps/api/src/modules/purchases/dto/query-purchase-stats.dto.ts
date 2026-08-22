import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PurchaseStatus } from '@prisma/client';

export class QueryPurchaseStatsDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}
