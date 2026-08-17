import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignStatus } from '@prisma/client';

export class CampaignSegmentCityDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string; // case-insensitive contains (consistent with customers list filter)
}

export class CampaignSegmentProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string; // product uuid
}

export class CampaignSegmentPurchaseDto {
  @IsOptional()
  @IsDateString()
  purchaseFrom?: string; // ISO date, whole-day inclusive (NR-010 precedent)

  @IsOptional()
  @IsDateString()
  purchaseTo?: string; // ISO date, whole-day inclusive
}

export class CampaignSegmentCustomerStatusDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  customerStatus?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
}

export class CampaignSegmentDto {
  @ValidateNested()
  @Type(() => CampaignSegmentCityDto)
  @IsOptional()
  city?: CampaignSegmentCityDto;

  @ValidateNested()
  @Type(() => CampaignSegmentProductDto)
  @IsOptional()
  productId?: CampaignSegmentProductDto;

  @ValidateNested()
  @Type(() => CampaignSegmentPurchaseDto)
  @IsOptional()
  purchaseFrom?: CampaignSegmentPurchaseDto;

  @ValidateNested()
  @Type(() => CampaignSegmentPurchaseDto)
  @IsOptional()
  purchaseTo?: CampaignSegmentPurchaseDto;

  @ValidateNested()
  @Type(() => CampaignSegmentCustomerStatusDto)
  @IsOptional()
  customerStatus?: CampaignSegmentCustomerStatusDto;
}