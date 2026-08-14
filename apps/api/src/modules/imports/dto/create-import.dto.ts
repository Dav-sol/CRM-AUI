import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ImportType } from '@prisma/client';

export class CreateImportDto {
  @IsEnum(ImportType)
  type!: ImportType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organizationId?: string;
}
