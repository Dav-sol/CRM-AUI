import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MessageDirection, MessageStatus } from '@prisma/client';

const SORT_FIELDS = 'createdAt|sentAt|status';

export class QueryMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationId?: string;

  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @IsOptional()
  @IsEnum(MessageDirection)
  direction?: MessageDirection;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  automationId?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(${SORT_FIELDS})$`))
  sort?: string;
}
