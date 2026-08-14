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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCustomersDto,
  ) {
    return this.customersService.findAll(user, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const customer = await this.customersService.findById(user, id);
    if (!customer) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' },
      });
    }
    return { data: customer };
  }

  @Post()
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    const customer = await this.customersService.create(user, dto);
    return { data: customer };
  }

  @Patch(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const customer = await this.customersService.update(user, id, dto);
    return { data: customer };
  }

  @Delete(':id')
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR', 'GERENTE')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.customersService.remove(user, id);
    return { data: { success: true } };
  }
}
