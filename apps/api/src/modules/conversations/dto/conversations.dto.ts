import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SORT_FIELDS = 'createdAt|name|conversationCount';

export class QueryConversationTagsDto {
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
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(${SORT_FIELDS})$`))
  sort?: string;
}

export class QueryQuickRepliesDto {
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
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @Matches(new RegExp(`^-?(createdAt|title)$`))
  sort?: string;
}

export class ConversationParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}

export class TagUuidPathParamsDto {
  @IsString()
  @MaxLength(64)
  tagUuid!: string;
}

export class TagPathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}

export class QuickReplyPathParamsDto {
  @IsString()
  @MaxLength(64)
  uuid!: string;
}

export class AssignConversationDto {
  @IsString()
  @MaxLength(64)
  advisorId!: string;
}

export class ReplyConversationDto {
  @IsString()
  @MaxLength(4096)
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  quickReplyId?: string;
}

export class CreateConversationNoteDto {
  @IsString()
  @MaxLength(4000)
  @MinLength(1)
  content!: string;
}

export class CreateConversationTagDto {
  @IsString()
  @MaxLength(50)
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class UpdateConversationTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class CreateQuickReplyDto {
  @IsString()
  @MaxLength(100)
  @MinLength(1)
  title!: string;

  @IsString()
  @MaxLength(4096)
  @MinLength(1)
  body!: string;
}

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  @MinLength(1)
  body?: string;
}
