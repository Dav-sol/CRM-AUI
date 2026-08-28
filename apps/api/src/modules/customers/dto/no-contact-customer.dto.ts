import { IsOptional, IsString, MaxLength } from 'class-validator';

export class NoContactCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
