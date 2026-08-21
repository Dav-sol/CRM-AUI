import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UpdateFollowUpSequenceStageDto } from './follow-up-sequence-stage.dto';

export const ALLOWED_WARRANTY_MONTHS = [12, 15, 18, 24] as const;

export type WarrantyMonths = (typeof ALLOWED_WARRANTY_MONTHS)[number];

export class UpdateFollowUpSequenceDto {
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
  @IsInt()
  @Min(1)
  warrantyMonths?: WarrantyMonths;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateFollowUpSequenceStageDto)
  stages?: UpdateFollowUpSequenceStageDto[];
}
