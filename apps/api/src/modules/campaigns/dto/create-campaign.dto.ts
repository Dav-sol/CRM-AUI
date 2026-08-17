import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CampaignStatus } from '@prisma/client';
import { CampaignSegmentDto } from './campaign-segment.dto';

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(CampaignStatus)
  type!: CampaignStatus; // informational in v1 (AUTOMATIC/MANUAL/REPURCHASE/SPECIAL)

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template!: string; // free text; supports {customerName}/{productName}/{organizationName} placeholders

  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  @IsOptional()
  segment?: CampaignSegmentDto; // ≥1 criterion if present (INFERENCIA)

  @IsOptional()
  @IsDateString()
  startAt?: string; // ISO date-time; scheduledDate = max(startAt, now) at activation
}