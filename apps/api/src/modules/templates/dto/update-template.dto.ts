import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { TemplateAngle, TemplateCategory, TemplateTone } from '@prisma/client';
import { CreateTemplateDto, ValidTemplateBody } from './create-template.dto';

// PATCH parcial: todos los campos opcionales, al menos uno requerido
// (verificado en el servicio).
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  group?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsEnum(TemplateTone)
  tone?: TemplateTone;

  @IsOptional()
  @IsEnum(TemplateAngle)
  angle?: TemplateAngle;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recommendedUse?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Validate(ValidTemplateBody)
  body?: string;
}

export type { CreateTemplateDto };
