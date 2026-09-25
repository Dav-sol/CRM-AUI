import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';

export type MessageSource =
  'campaign_template' | 'campaign_stage' | 'sequence_stage' | 'quick_reply';

export interface AggregatedMessage {
  id: string;
  source: MessageSource;
  sourceName: string;
  sourceId: string;
  body: string;
  anchor?: string;
  offsetDays?: number;
  updatedAt: Date;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser): Promise<AggregatedMessage[]> {
    const organizationId = this.requireOrg(user);
    const messages: AggregatedMessage[] = [];

    // 1. Campaign templates + inline stages
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        uuid: true,
        name: true,
        template: true,
        stages: true,
        updatedAt: true,
      },
    });

    for (const c of campaigns) {
      // Main campaign template
      if (c.template?.trim()) {
        messages.push({
          id: `campaign-${c.id}`,
          source: 'campaign_template',
          sourceName: c.name,
          sourceId: c.uuid,
          body: c.template,
          updatedAt: c.updatedAt,
        });
      }

      // Inline stages (JSON)
      if (Array.isArray(c.stages)) {
        for (let i = 0; i < c.stages.length; i++) {
          const stage = c.stages[i] as Record<string, unknown>;
          const body = (stage.template as string) || '';
          if (!body.trim()) continue;
          messages.push({
            id: `campaign-stage-${c.id}-${i}`,
            source: 'campaign_stage',
            sourceName: `${c.name} — ${stage.name ?? `Etapa ${i + 1}`}`,
            sourceId: c.uuid,
            body,
            anchor: stage.anchor as string | undefined,
            offsetDays: stage.offsetDays as number | undefined,
            updatedAt: c.updatedAt,
          });
        }
      }
    }

    // 2. Sequence stages
    const stages = await this.prisma.followUpSequenceStage.findMany({
      where: {
        deletedAt: null,
        sequence: { organizationId, deletedAt: null },
      },
      include: { sequence: { select: { name: true, uuid: true } } },
    });

    for (const s of stages) {
      if (s.template?.trim()) {
        messages.push({
          id: `seq-stage-${s.id}`,
          source: 'sequence_stage',
          sourceName: `${s.sequence.name} — ${s.name}`,
          sourceId: s.sequence.uuid,
          body: s.template,
          anchor: s.anchor,
          offsetDays: s.offsetDays,
          updatedAt: s.updatedAt,
        });
      }
    }

    // 3. Quick replies
    const quickReplies = await this.prisma.quickReply.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        uuid: true,
        title: true,
        body: true,
        updatedAt: true,
      },
    });

    for (const qr of quickReplies) {
      messages.push({
        id: `qr-${qr.id}`,
        source: 'quick_reply',
        sourceName: qr.title,
        sourceId: qr.uuid,
        body: qr.body,
        updatedAt: qr.updatedAt,
      });
    }

    return messages;
  }

  private requireOrg(user: AuthUser): string {
    if (!user.organizationId) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization context required',
        },
      });
    }
    return user.organizationId;
  }
}
