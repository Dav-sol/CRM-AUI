import { IsUUID } from 'class-validator';

export class FollowUpSequencePathParamsDto {
  @IsUUID()
  uuid!: string;
}
