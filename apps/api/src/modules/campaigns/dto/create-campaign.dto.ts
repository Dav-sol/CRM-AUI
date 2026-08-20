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

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(CampaignType)
  type!: CampaignType; // informational in v1 (AUTOMATIC/MANUAL/REPURCHASE/SPECIAL)

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template!: string; // free text; supports {customerName}/{productName}/{organizationName} placeholders

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  templateD3?: string; // mensaje de la etapa +3 días (si se define, reemplaza template en esa etapa)

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  templateD180?: string; // mensaje de la etapa +6 meses

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  templateD365?: string; // mensaje de la etapa +12 meses

  @ValidateIf((_o, value) => value !== undefined)
  @Validate(SegmentHasCriterionConstraint)
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment?: CampaignSegmentDto; // ≥1 criterion required when present (HG-7)

  @IsOptional()
  @IsDateString()
  startAt?: string; // ISO date-time; scheduledDate = max(startAt, now) at activation
}
