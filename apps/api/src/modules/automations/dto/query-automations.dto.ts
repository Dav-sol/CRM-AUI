import { Type } from 'class-transformer';
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
import { AutomationPurpose, AutomationStatus } from '@prisma/client';

const SORT_FIELDS = 'scheduledDate|createdAt|updatedAt|status';

export class QueryAutomationsDto {
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
  @IsEnum(AutomationStatus)
  status?: AutomationStatus;

  @IsOptional()
  @IsEnum(AutomationPurpose)
  purpose?: AutomationPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  commercialCycleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  campaignId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsDateString()
  scheduledFrom?: string;

  @IsOptional()
  @IsDateString()
  scheduledTo?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(${SORT_FIELDS})$`))
  sort?: string;
}
