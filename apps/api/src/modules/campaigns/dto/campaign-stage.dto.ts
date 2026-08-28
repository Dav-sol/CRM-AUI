import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FollowUpStageAnchor } from '@prisma/client';

// Fase 1: etapa inline de campaña (timeline del editor). Misma semántica que
// FollowUpSequenceStage pero persistida en Campaign.stages (Json).
export class CampaignStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsEnum(FollowUpStageAnchor)
  anchor!: FollowUpStageAnchor;

  @IsInt()
  @Min(-3650)
  @Max(3650)
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

export class CampaignStagesArrayDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CampaignStageDto)
  stages!: CampaignStageDto[];
}
