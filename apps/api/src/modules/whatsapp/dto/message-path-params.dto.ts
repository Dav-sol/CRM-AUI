import { IsString, MaxLength } from 'class-validator';

export class MessagePathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}
