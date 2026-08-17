import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '@prisma/client';
import { CampaignSegmentDto } from './campaign-segment.dto';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  type!: CampaignStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template!: string;

  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  @IsOptional()
  segment?: CampaignSegmentDto; // if present, ≥1 of its fields required (INFERENCIA)

  @IsOptional()
  @IsDateString()
  startAt?: string;

  // At least one field must be provided for PATCH
}