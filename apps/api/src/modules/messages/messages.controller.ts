import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';

@Controller('message-overview')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const messages = await this.messagesService.findAll(user);
    return { data: messages };
  }
}
