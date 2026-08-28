import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignType } from '@prisma/client';
import { CampaignSegmentDto } from './campaign-segment.dto';

// Fase 3 (P0-5): preview stateless para el creador de campañas (sin uuid).
export class PreviewSegmentDraftDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignSegmentDto)
  segment?: CampaignSegmentDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  followUpSequenceId?: string;

  // Fase P0.2 (D6): tipo para estimar la tarifa por propósito
  // (transaccional vs comercial).
  @IsOptional()
  @IsEnum(CampaignType)
  type?: CampaignType;
}
