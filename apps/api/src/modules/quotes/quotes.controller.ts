import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { IsUUID } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

class QuotePathParamsDto {
  @IsUUID()
  uuid!: string;
}

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateQuoteDto) {
    return { data: await this.quotesService.create(user, body) };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: QueryQuotesDto) {
    return this.quotesService.list(user, query);
  }

  @Get(':uuid')
  async get(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
  ) {
    if (!params.uuid || params.uuid.length > 64) {
      throw new BadRequestException();
    }
    return { data: await this.quotesService.get(user, params.uuid) };
  }

  @Patch(':uuid')
  async update(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
    @Body() body: UpdateQuoteDto,
  ) {
    return { data: await this.quotesService.update(user, params.uuid, body) };
  }

  @Post(':uuid/send')
  @HttpCode(HttpStatus.OK)
  async send(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
  ) {
    return { data: await this.quotesService.send(user, params.uuid) };
  }

  @Post(':uuid/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
  ) {
    return { data: await this.quotesService.accept(user, params.uuid) };
  }

  @Post(':uuid/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
  ) {
    return { data: await this.quotesService.reject(user, params.uuid) };
  }

  @Post(':uuid/expire')
  @HttpCode(HttpStatus.OK)
  async expire(
    @CurrentUser() user: AuthUser,
    @Param() params: QuotePathParamsDto,
  ) {
    return { data: await this.quotesService.expire(user, params.uuid) };
  }
}
