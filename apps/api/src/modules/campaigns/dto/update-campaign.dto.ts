import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CampaignType } from '@prisma/client';
import {
  CampaignSegmentDto,
  SegmentHasCriterionConstraint,
} from './campaign-segment.dto';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template?: string;

  @ValidateIf((_o, value) => value !== undefined)
  @Validate(SegmentHasCriterionConstraint)
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment?: CampaignSegmentDto; // ≥1 criterion required when present (HG-7)

  @IsOptional()
  @IsDateString()
  startAt?: string;

  // At least one field must be provided for PATCH
}
