import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CustomerStatus } from '@prisma/client';

@ValidatorConstraint({ name: 'segmentHasCriterion', async: false })
export class SegmentHasCriterionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const segment = value as Record<string, unknown>;
    return (
      segment.city !== undefined ||
      segment.productId !== undefined ||
      segment.purchaseFrom !== undefined ||
      segment.purchaseTo !== undefined ||
      segment.customerStatus !== undefined
    );
  }

  defaultMessage(): string {
    return 'segment must include at least one criterion';
  }
}

export class CampaignSegmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string; // case-insensitive contains (consistent with customers list filter)

  @IsOptional()
  @IsString()
  @MaxLength(64)
  productId?: string; // product uuid

  @IsOptional()
  @IsDateString()
  purchaseFrom?: string; // ISO date, whole-day inclusive (NR-010 precedent)

  @IsOptional()
  @IsDateString()
  purchaseTo?: string; // ISO date, whole-day inclusive

  @IsOptional()
  @IsEnum(CustomerStatus)
  customerStatus?: CustomerStatus;
}
