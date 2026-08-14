import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { CreateImportDto } from './dto/create-import.dto';
import { QueryImportsDto } from './dto/query-imports.dto';
import { ImportPathParamsDto } from './dto/import-path-params.dto';
import { MAX_FILE_SIZE_BYTES } from './imports.constants';
import { ImportFileSizeFilter } from './import-file-size.filter';
import { ImportsService } from './imports.service';

type UploadedFile = Express.Multer.File;

@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  @UseFilters(ImportFileSizeFilter)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  async create(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFile,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateImportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { job, created } = await this.importsService.create(
      user,
      dto,
      file,
      idempotencyKey,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { data: job };
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryImportsDto,
  ) {
    return this.importsService.findAll(user, query);
  }

  @Get(':uuid')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param() params: ImportPathParamsDto,
  ) {
    const job = await this.importsService.findById(user, params.uuid);
    if (!job) {
      throw new NotFoundException({
        error: { code: 'IMPORT_NOT_FOUND', message: 'Import job not found' },
      });
    }
    return { data: job };
  }

  @Post(':uuid/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param() params: ImportPathParamsDto,
  ) {
    await this.importsService.cancel(user, params.uuid);
    return { data: { uuid: params.uuid, status: 'CANCELLED', success: true } };
  }

  @Post(':uuid/retry')
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async retry(
    @CurrentUser() user: AuthUser,
    @Param() params: ImportPathParamsDto,
  ) {
    const job = await this.importsService.retry(user, params.uuid);
    return {
      data: {
        uuid: job.uuid,
        status: job.status,
        success: true,
      },
    };
  }
}
