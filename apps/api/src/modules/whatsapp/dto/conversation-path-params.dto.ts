import { IsString, MaxLength } from 'class-validator';

export class ConversationPathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}
