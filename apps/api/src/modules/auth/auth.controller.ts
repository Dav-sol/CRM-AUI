import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response, Request } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../core/guards/jwt-refresh.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
    });

    this.setRefreshCookie(res, result.refreshToken);

    return {
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      },
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as { userId: string; sessionId: string };
    const rawToken: string | undefined = (
      req.cookies as Record<string, string> | undefined
    )?.[this.cookieName];
    if (!rawToken) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    }

    const result = await this.authService.refresh(
      user.userId,
      user.sessionId,
      rawToken,
    );

    this.setRefreshCookie(res, result.refreshToken);

    return {
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken: string | undefined = (
      req.cookies as Record<string, string> | undefined
    )?.[this.cookieName];
    if (!rawToken) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }

    await this.authService.logout(rawToken);

    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return { data: { success: true } };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.authService.me(user.id);
    return { data: { user: profile } };
  }

  private get cookieName(): string {
    return (
      this.configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token'
    );
  }

  private get cookieSecure(): boolean {
    return this.configService.get<boolean>('jwt.cookieSecure') ?? true;
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(this.cookieName, refreshToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }
}
