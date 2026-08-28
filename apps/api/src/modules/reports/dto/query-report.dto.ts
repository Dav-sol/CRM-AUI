import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryReportDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsString()
  search?: string;
}
