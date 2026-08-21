import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryFollowUpSequencesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  warrantyMonths?: 12 | 15 | 18 | 24;

  @IsOptional()
  @IsString()
  sort?: string; // -createdAt, createdAt, name, warrantyMonths
}
