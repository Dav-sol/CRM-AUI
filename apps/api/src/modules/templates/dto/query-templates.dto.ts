import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TemplateAngle, TemplateCategory, TemplateTone } from '@prisma/client';

const SORT_FIELDS = 'code|name|group|category|tone|angle|createdAt|updatedAt';

export class QueryTemplatesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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
  @MaxLength(100)
  group?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(${SORT_FIELDS})$`))
  sort?: string;
}
