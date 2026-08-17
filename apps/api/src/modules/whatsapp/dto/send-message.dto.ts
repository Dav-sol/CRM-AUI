import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ChannelType } from '@prisma/client';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  customerId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4096)
  content!: string;

  @IsOptional()
  @IsEnum(ChannelType)
  channel?: ChannelType;
}
