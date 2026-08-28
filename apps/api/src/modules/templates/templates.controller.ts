import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryTemplatesDto,
  ) {
    return this.templatesService.findAll(user, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const template = await this.templatesService.findById(user, id);
    if (!template) {
      throw new NotFoundException({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }
    return { data: template };
  }

  @Post()
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    const template = await this.templatesService.create(user, dto);
    return { data: template };
  }

  @Patch(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const template = await this.templatesService.update(user, id, dto);
    return { data: template };
  }

  @Delete(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.templatesService.remove(user, id);
    return { data: { success: true } };
  }
}
