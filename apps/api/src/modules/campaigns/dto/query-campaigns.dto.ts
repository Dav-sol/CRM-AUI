import {
  IsOptional,
  IsInt,
  IsEnum,
  IsString,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '@prisma/client';
import { CampaignType } from '@prisma/client';

export class QueryCampaignsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string; // name contains, case-insensitive

  @IsOptional()
  @IsDateString()
  startAtFrom?: string; // whole-day inclusive (NR-010)

  @IsOptional()
  @IsDateString()
  startAtTo?: string; // whole-day inclusive
}