import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_OWNER', 'ADMINISTRADOR')
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ) {
    const result = await this.invitationsService.create(
      user,
      dto.email,
      dto.roleId,
      dto.organizationId,
    );
    return { data: result };
  }

  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invitationsService.accept(
      dto.token,
      dto.password,
      {
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip ?? null,
      },
    );

    const cookieName =
      this.configService.get<string>('jwt.refreshCookieName') ??
      'refresh_token';
    const secure = this.configService.get<boolean>('jwt.cookieSecure') ?? true;
    res.cookie(cookieName, result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return {
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      },
    };
  }
}
