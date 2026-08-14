import { Injectable } from '@nestjs/common';
import { PasswordResetToken, User } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface CreateResetTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export type ResetTokenConsumeResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'not_found' | 'used' | 'expired' };

@Injectable()
export class PasswordResetTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateResetTokenInput): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  async consume(tokenHash: string): Promise<ResetTokenConsumeResult> {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      return { ok: false, reason: 'not_found' };
    }
    if (record.usedAt) {
      return { ok: false, reason: 'used' };
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return { ok: true, user: record.user };
  }
}
