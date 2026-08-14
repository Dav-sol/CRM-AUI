import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { ConfirmResetDto } from './dto/confirm-reset.dto';
import { RequestResetDto } from './dto/request-reset.dto';

@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('request')
  @HttpCode(200)
  async request(@Body() dto: RequestResetDto) {
    const result = await this.passwordResetService.requestReset(dto.email);
    return { data: result };
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(@Body() dto: ConfirmResetDto) {
    await this.passwordResetService.confirmReset(dto.token, dto.password);
    return { data: { success: true } };
  }
}
