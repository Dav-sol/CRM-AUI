import {
  Body,
  Controller,
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
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { QueryPurchasesDto } from './dto/query-purchases.dto';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryPurchasesDto,
  ) {
    return this.purchasesService.findAll(user, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const purchase = await this.purchasesService.findById(user, id);
    if (!purchase) {
      throw new NotFoundException({
        error: { code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' },
      });
    }
    return { data: purchase };
  }

  @Post()
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    const purchase = await this.purchasesService.create(user, dto);
    return { data: purchase };
  }

  @Patch(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    const purchase = await this.purchasesService.update(user, id, dto);
    return { data: purchase };
  }
}
