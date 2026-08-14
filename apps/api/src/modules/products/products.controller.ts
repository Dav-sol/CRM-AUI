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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryProductsDto,
  ) {
    return this.productsService.findAll(user, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const product = await this.productsService.findById(user, id);
    if (!product) {
      throw new NotFoundException({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' },
      });
    }
    return { data: product };
  }

  @Post()
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    const product = await this.productsService.create(user, dto);
    return { data: product };
  }

  @Patch(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productsService.update(user, id, dto);
    return { data: product };
  }

  @Delete(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.productsService.remove(user, id);
    return { data: { success: true } };
  }
}
