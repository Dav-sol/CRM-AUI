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
import { CreateFollowUpSequenceStageDto } from './follow-up-sequence-stage.dto';

export const ALLOWED_WARRANTY_MONTHS = [12, 15, 18, 24] as const;

export type WarrantyMonths = (typeof ALLOWED_WARRANTY_MONTHS)[number];

export class CreateFollowUpSequenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  warrantyMonths!: WarrantyMonths;

  @ValidateNested({ each: true })
  @Type(() => CreateFollowUpSequenceStageDto)
  stages!: CreateFollowUpSequenceStageDto[];
}
