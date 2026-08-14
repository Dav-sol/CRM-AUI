import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
