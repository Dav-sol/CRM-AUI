import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CustomerStatus } from '@prisma/client';

@ValidatorConstraint({ name: 'codcliImmutable', async: false })
export class CodcliImmutableConstraint implements ValidatorConstraintInterface {
  validate(): boolean {
    return false;
  }

  defaultMessage(): string {
    return 'codcli is immutable and cannot be updated';
  }
}

export class UpdateCustomerDto {
  @ValidateIf((_o, value) => value !== undefined)
  @Validate(CodcliImmutableConstraint)
  codcli?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
