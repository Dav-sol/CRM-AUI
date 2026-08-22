import { FollowUpStageAnchor } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFollowUpSequenceStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(FollowUpStageAnchor)
  anchor?: FollowUpStageAnchor;

  @IsInt()
  @Min(-365)
  @Max(730)
  offsetDays!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  templateOnPast?: string;
}

export class UpdateFollowUpSequenceStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(FollowUpStageAnchor)
  anchor?: FollowUpStageAnchor;

  @IsOptional()
  @IsInt()
  @Min(-365)
  @Max(730)
  offsetDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  templateOnPast?: string;
}
