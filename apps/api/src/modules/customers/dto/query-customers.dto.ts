import { Type } from 'class-transformer';
import {
  IsDateString,
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
import { CustomerStatus } from '@prisma/client';

const SORT_FIELDS = 'name|codcli|city|status|createdAt|updatedAt';

export class QueryCustomersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(${SORT_FIELDS})$`))
  sort?: string;

  // P0.1: filtros de drill-down del dashboard y listado comercial.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  warrantyExpiringInDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1825)
  warrantyExpiredInDays?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  hasPurchases?: 'true' | 'false';

  @IsOptional()
  @IsIn(['true'])
  noContact?: 'true';

  @IsOptional()
  @IsIn(['true'])
  recurrent?: 'true';
}
