import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

@ValidatorConstraint({ name: 'codeImmutable', async: false })
export class CodeImmutableConstraint implements ValidatorConstraintInterface {
  validate(): boolean {
    return false;
  }

  defaultMessage(): string {
    return 'code is immutable and cannot be updated';
  }
}

export class UpdateProductDto {
  @ValidateIf((_o, value) => value !== undefined)
  @Validate(CodeImmutableConstraint)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  @IsIn([12, 15, 18, 24])
  warrantyMonths?: number;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
