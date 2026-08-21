import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFollowUpSequenceStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(-365)
  @Max(365)
  offsetDays!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template!: string;
}

export class UpdateFollowUpSequenceStageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(-365)
  @Max(365)
  offsetDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  template?: string;
}
