import { IsString, MaxLength } from 'class-validator';

export class ImportPathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}
