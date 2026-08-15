import { IsString, MaxLength } from 'class-validator';

export class AutomationPathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}
