import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { TemplateAngle, TemplateCategory, TemplateTone } from '@prisma/client';
import { findInvalidVariables } from '../../../common/message-variables';

// Valida que el body solo use las variables soportadas (P0.2).
export class ValidTemplateBody {
  validate(value: string): boolean {
    return findInvalidVariables(value).length === 0;
  }

  defaultMessage(): string {
    return 'La plantilla contiene variables desconocidas. Usa: {customerName}, {productName}, {organizationName}, {brand}, {warrantyExpiresAt}, {purchaseDate}';
  }
}

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  group?: string;

  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @IsEnum(TemplateTone)
  tone!: TemplateTone;

  @IsEnum(TemplateAngle)
  angle!: TemplateAngle;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recommendedUse?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Validate(ValidTemplateBody)
  body!: string;
}
