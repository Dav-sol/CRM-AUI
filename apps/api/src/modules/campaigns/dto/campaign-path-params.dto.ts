import { IsString } from 'class-validator';

export class CampaignPathParamsDto {
  @IsString()
  uuid!: string;
}
