import { IsDateString, IsOptional } from 'class-validator';

export class QueryDashboardRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsDateString()
  compareFrom?: string;

  @IsOptional()
  @IsDateString()
  compareTo?: string;
}
