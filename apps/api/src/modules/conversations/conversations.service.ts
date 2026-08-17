import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { MessageDetail, WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ConversationArchivedPayload,
  ConversationAssignedPayload,
  ConversationClosedPayload,
  ConversationTransferredPayload,
  ConversationsEventState,
  buildConversationsEvent,
} from './conversations.events';
import {
  AssignConversationDto,
  ConversationParamsDto,
  CreateConversationNoteDto,
  CreateConversationTagDto,
  CreateQuickReplyDto,
  QuickReplyPathParamsDto,
  QueryConversationTagsDto,
  QueryQuickRepliesDto,
  ReplyConversationDto,
  TagPathParamsDto,
  TagUuidPathParamsDto,
  UpdateConversationTagDto,
  UpdateQuickReplyDto,
} from './dto/conversations.dto';

const MODULE = 'conversations';

const TAG_SORT_FIELDS = new Set(['createdAt', 'name', 'conversationCount']);
const QUICK_REPLY_SORT_FIELDS = new Set(['createdAt', 'title']);

export interface AdvisorRef {
  uuid: string;
  firstName: string;
  lastName: string;
}

export interface ConversationTagRef {
  uuid: string;
  name: string;
  color: string | null;
}

export interface ConversationNoteSummary {
  uuid: string;
  author: AdvisorRef;
  content: string;
  createdAt: string;
}

export interface ConversationTagSummary {
  uuid: string;
  name: string;
  color: string | null;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuickReplySummary {
  uuid: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly whatsappService: WhatsappService,
  ) {}

  // ---------------------------------------------------------------------------
  // Asesor reply (Flujo 07 step 3, FR-003)
  // ---------------------------------------------------------------------------

  async reply(
    user: AuthUser,
    params: ConversationParamsDto,
    dto: ReplyConversationDto,
    idempotencyKey?: string,
  ): Promise<MessageDetail> {
    if (dto.quickReplyId) {
      const org = this.orgScope(user);
      const quickReply = await this.prisma.quickReply.findFirst({
        where: {
          uuid: dto.quickReplyId,
          deletedAt: null,
          ...(org ? { organizationId: org } : {}),
        },
        select: { uuid: true },
      });
      if (!quickReply) {
        throw new NotFoundException({
          error: {
            code: 'QUICK_REPLY_NOT_FOUND',
            message: 'Quick reply not found',
          },
        });
      }
      await this.auditService.record({
        module: MODULE,
        action: 'quick_reply.use',
        outcome: 'success',
        userId: user.id,
        organizationId: user.organizationId ?? null,
        metadata: { quickReplyId: quickReply.uuid },
      });
    }

    const message = await this.whatsappService.sendReply(
      user,
      params.uuid,
      dto.content,
      idempotencyKey,
    );
    if (!message) {
      throw new NotFoundException({
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      });
    }
    return message;
  }

  // ---------------------------------------------------------------------------
  // Assignment / transfer (FR-004)
  // ---------------------------------------------------------------------------

  async assign(
    user: AuthUser,
    params: ConversationParamsDto,
    dto: AssignConversationDto,
  ): Promise<{ uuid: string; advisor: AdvisorRef }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const advisor = await this.findScopedAdvisor(
      conversation.organizationId,
      dto.advisorId,
    );
    if (!advisor || advisor.status === UserStatus.SUSPENDED) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid advisor' },
      });
    }

    if (conversation.advisorId === advisor.id) {
      return {
        uuid: conversation.uuid,
        advisor: toAdvisorRef(advisor),
      };
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { advisorId: advisor.id },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.assign',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `conversation assigned conversation=${conversation.uuid} advisor=${advisor.uuid}`,
      metadata: {
        conversationId: conversation.uuid,
        advisorId: advisor.uuid,
      },
    });
    this.emit('ConversationAssigned', user.id, conversation.organizationId, {
      conversationId: conversation.uuid,
      advisorId: advisor.uuid,
      assignedBy: user.uuid,
      assignedAt: new Date().toISOString(),
    } satisfies ConversationAssignedPayload);

    return { uuid: conversation.uuid, advisor: toAdvisorRef(advisor) };
  }

  async transfer(
    user: AuthUser,
    params: ConversationParamsDto,
    dto: AssignConversationDto,
  ): Promise<{ uuid: string; advisor: AdvisorRef }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const advisor = await this.findScopedAdvisor(
      conversation.organizationId,
      dto.advisorId,
    );
    if (!advisor || advisor.status === UserStatus.SUSPENDED) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid advisor' },
      });
    }

    if (conversation.advisorId === advisor.id) {
      return {
        uuid: conversation.uuid,
        advisor: toAdvisorRef(advisor),
      };
    }

    const fromAdvisorId = conversation.advisorId
      ? await this.findUserUuidById(conversation.advisorId)
      : null;

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { advisorId: advisor.id },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.transfer',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `conversation transferred conversation=${conversation.uuid} from=${fromAdvisorId ?? 'none'} to=${advisor.uuid}`,
      metadata: {
        conversationId: conversation.uuid,
        fromAdvisorId,
        toAdvisorId: advisor.uuid,
      },
    });
    this.emit('ConversationTransferred', user.id, conversation.organizationId, {
      conversationId: conversation.uuid,
      fromAdvisorId,
      toAdvisorId: advisor.uuid,
      transferredBy: user.uuid,
      transferredAt: new Date().toISOString(),
    } satisfies ConversationTransferredPayload);

    return { uuid: conversation.uuid, advisor: toAdvisorRef(advisor) };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle transitions (FR-005, CO-003)
  // ---------------------------------------------------------------------------

  async close(
    user: AuthUser,
    params: ConversationParamsDto,
  ): Promise<{ uuid: string; status: ConversationStatus }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const updated = await this.prisma.conversation.updateMany({
      where: { id: conversation.id, status: ConversationStatus.OPEN },
      data: { status: ConversationStatus.CLOSED },
    });
    if (updated.count === 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Conversation is not OPEN',
        },
      });
    }
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.close',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `conversation closed conversation=${conversation.uuid}`,
      metadata: { conversationId: conversation.uuid },
    });
    this.emit('ConversationClosed', user.id, conversation.organizationId, {
      conversationId: conversation.uuid,
      closedBy: user.uuid,
      changedAt: new Date().toISOString(),
    } satisfies ConversationClosedPayload);
    return { uuid: conversation.uuid, status: ConversationStatus.CLOSED };
  }

  async archive(
    user: AuthUser,
    params: ConversationParamsDto,
  ): Promise<{ uuid: string; status: ConversationStatus }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const updated = await this.prisma.conversation.updateMany({
      where: {
        id: conversation.id,
        status: { in: [ConversationStatus.OPEN, ConversationStatus.CLOSED] },
      },
      data: { status: ConversationStatus.ARCHIVED },
    });
    if (updated.count === 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Conversation is already ARCHIVED',
        },
      });
    }
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.archive',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `conversation archived conversation=${conversation.uuid}`,
      metadata: { conversationId: conversation.uuid },
    });
    this.emit('ConversationArchived', user.id, conversation.organizationId, {
      conversationId: conversation.uuid,
      archivedBy: user.uuid,
      changedAt: new Date().toISOString(),
    } satisfies ConversationArchivedPayload);
    return { uuid: conversation.uuid, status: ConversationStatus.ARCHIVED };
  }

  async reopen(
    user: AuthUser,
    params: ConversationParamsDto,
  ): Promise<{ uuid: string; status: ConversationStatus }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const updated = await this.prisma.conversation.updateMany({
      where: {
        id: conversation.id,
        status: {
          in: [ConversationStatus.CLOSED, ConversationStatus.ARCHIVED],
        },
      },
      data: { status: ConversationStatus.OPEN },
    });
    if (updated.count === 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Conversation is already OPEN',
        },
      });
    }
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.reopen',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `conversation reopened conversation=${conversation.uuid}`,
      metadata: { conversationId: conversation.uuid },
    });
    return { uuid: conversation.uuid, status: ConversationStatus.OPEN };
  }

  // ---------------------------------------------------------------------------
  // Notes (FR-007, append-only)
  // ---------------------------------------------------------------------------

  async addNote(
    user: AuthUser,
    params: ConversationParamsDto,
    dto: CreateConversationNoteDto,
  ): Promise<ConversationNoteSummary> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const note = await this.prisma.conversationNote.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        userId: user.id,
        content: dto.content,
      },
      select: {
        uuid: true,
        content: true,
        createdAt: true,
        author: {
          select: { uuid: true, firstName: true, lastName: true },
        },
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.note.create',
      outcome: 'success',
      userId: user.id,
      organizationId: conversation.organizationId,
      description: `note added conversation=${conversation.uuid}`,
      metadata: { conversationId: conversation.uuid, noteId: note.uuid },
    });
    return toNoteSummary(note);
  }

  async listNotes(
    user: AuthUser,
    params: ConversationParamsDto,
  ): Promise<ConversationNoteSummary[]> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const notes = await this.prisma.conversationNote.findMany({
      where: { conversationId: conversation.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        uuid: true,
        content: true,
        createdAt: true,
        author: { select: { uuid: true, firstName: true, lastName: true } },
      },
    });
    return notes.map(toNoteSummary);
  }

  // ---------------------------------------------------------------------------
  // Tags (FR-006)
  // ---------------------------------------------------------------------------

  async assignTag(
    user: AuthUser,
    params: ConversationParamsDto,
    tagParams: TagUuidPathParamsDto,
  ): Promise<{ uuid: string; tags: ConversationTagRef[] }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const tag = await this.findScopedTag(
      conversation.organizationId,
      tagParams.tagUuid,
    );
    if (!tag) {
      throw new NotFoundException({
        error: { code: 'TAG_NOT_FOUND', message: 'Tag not found' },
      });
    }

    const existing = await this.prisma.conversationTagAssignment.findFirst({
      where: {
        conversationId: conversation.id,
        tagId: tag.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!existing) {
      try {
        await this.prisma.conversationTagAssignment.create({
          data: {
            organizationId: conversation.organizationId,
            conversationId: conversation.id,
            tagId: tag.id,
            createdById: user.id,
          },
        });
      } catch (error) {
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )) {
          throw error;
        }
        const revived = await this.prisma.conversationTagAssignment.findFirst({
          where: {
            conversationId: conversation.id,
            tagId: tag.id,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!revived) {
          await this.prisma.conversationTagAssignment.updateMany({
            where: { conversationId: conversation.id, tagId: tag.id },
            data: {
              deletedAt: null,
              createdById: user.id,
              updatedAt: new Date(),
            },
          });
        }
      }
      await this.auditService.record({
        module: MODULE,
        action: 'conversation.tag.assign',
        outcome: 'success',
        userId: user.id,
        organizationId: conversation.organizationId,
        description: `tag assigned conversation=${conversation.uuid} tag=${tag.uuid}`,
        metadata: { conversationId: conversation.uuid, tagId: tag.uuid },
      });
    }

    const tags = await this.listTagsForConversation(
      conversation.organizationId,
      conversation.id,
    );
    return { uuid: conversation.uuid, tags };
  }

  async removeTag(
    user: AuthUser,
    params: ConversationParamsDto,
    tagParams: TagUuidPathParamsDto,
  ): Promise<{ uuid: string; tags: ConversationTagRef[] }> {
    const conversation = await this.findScopedConversation(user, params.uuid);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    const tag = await this.findScopedTag(
      conversation.organizationId,
      tagParams.tagUuid,
    );
    if (!tag) {
      throw new NotFoundException({
        error: { code: 'TAG_NOT_FOUND', message: 'Tag not found' },
      });
    }

    const removed = await this.prisma.conversationTagAssignment.updateMany({
      where: {
        conversationId: conversation.id,
        tagId: tag.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    if (removed.count > 0) {
      await this.auditService.record({
        module: MODULE,
        action: 'conversation.tag.remove',
        outcome: 'success',
        userId: user.id,
        organizationId: conversation.organizationId,
        description: `tag removed conversation=${conversation.uuid} tag=${tag.uuid}`,
        metadata: { conversationId: conversation.uuid, tagId: tag.uuid },
      });
    }

    const tags = await this.listTagsForConversation(
      conversation.organizationId,
      conversation.id,
    );
    return { uuid: conversation.uuid, tags };
  }

  async listTags(
    user: AuthUser,
    query: QueryConversationTagsDto,
  ): Promise<ListResult<ConversationTagSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const org = this.orgScope(user);
    const where: Prisma.ConversationTagWhereInput = { deletedAt: null };
    if (org) {
      where.organizationId = org;
    }
    if (query.name) {
      where.name = { startsWith: query.name, mode: 'insensitive' };
    }

    const rawSort = query.sort ?? '-createdAt';
    const sortField = rawSort.replace(/^-/, '');
    if (!TAG_SORT_FIELDS.has(sortField)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const sortDesc = rawSort.startsWith('-');
    const orderBy =
      sortField === 'conversationCount'
        ? undefined
        : { [sortField]: sortDesc ? ('desc' as const) : ('asc' as const) };

    const [total, tags] = await Promise.all([
      this.prisma.conversationTag.count({ where }),
      this.prisma.conversationTag.findMany({
        where,
        ...(orderBy ? { orderBy } : {}),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const ids = tags.map((tag) => tag.id);
    const counts = ids.length
      ? await this.prisma.conversationTagAssignment.groupBy({
          by: ['tagId'],
          where: { tagId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(counts.map((row) => [row.tagId, row._count._all]));

    const data = tags.map((tag) =>
      toTagSummary(tag, countMap.get(tag.id) ?? 0),
    );
    if (sortField === 'conversationCount') {
      data.sort((a, b) =>
        sortDesc
          ? b.conversationCount - a.conversationCount
          : a.conversationCount - b.conversationCount,
      );
    }

    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async createTag(
    user: AuthUser,
    dto: CreateConversationTagDto,
  ): Promise<ConversationTagSummary> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    try {
      const tag = await this.prisma.conversationTag.create({
        data: {
          organizationId: org,
          name: dto.name,
          color: dto.color ?? null,
        },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'conversation.tag.create',
        outcome: 'success',
        userId: user.id,
        organizationId: org,
        description: `tag created tag=${tag.uuid}`,
        metadata: { tagId: tag.uuid },
      });
      return toTagSummary(tag, 0);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          error: {
            code: 'TAG_NAME_EXISTS',
            message: 'A tag with this name already exists',
          },
        });
      }
      throw error;
    }
  }

  async updateTag(
    user: AuthUser,
    params: TagPathParamsDto,
    dto: UpdateConversationTagDto,
  ): Promise<ConversationTagSummary> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    const tag = await this.prisma.conversationTag.findFirst({
      where: { uuid: params.uuid, organizationId: org, deletedAt: null },
    });
    if (!tag) {
      throw new NotFoundException({
        error: { code: 'TAG_NOT_FOUND', message: 'Tag not found' },
      });
    }
    try {
      const updated = await this.prisma.conversationTag.update({
        where: { id: tag.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
      });
      const active = await this.prisma.conversationTagAssignment.count({
        where: { tagId: tag.id, deletedAt: null },
      });
      await this.auditService.record({
        module: MODULE,
        action: 'conversation.tag.update',
        outcome: 'success',
        userId: user.id,
        organizationId: org,
        description: `tag updated tag=${updated.uuid}`,
        metadata: { tagId: updated.uuid },
      });
      return toTagSummary(updated, active);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          error: {
            code: 'TAG_NAME_EXISTS',
            message: 'A tag with this name already exists',
          },
        });
      }
      throw error;
    }
  }

  async deleteTag(
    user: AuthUser,
    params: TagPathParamsDto,
  ): Promise<{ uuid: string; deleted: boolean }> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    const tag = await this.prisma.conversationTag.findFirst({
      where: { uuid: params.uuid, organizationId: org },
    });
    if (!tag) {
      throw new NotFoundException({
        error: { code: 'TAG_NOT_FOUND', message: 'Tag not found' },
      });
    }
    if (tag.deletedAt) {
      return { uuid: tag.uuid, deleted: true };
    }
    await this.prisma.$transaction([
      this.prisma.conversationTagAssignment.updateMany({
        where: { tagId: tag.id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
      this.prisma.conversationTag.update({
        where: { id: tag.id },
        data: { deletedAt: new Date() },
      }),
    ]);
    await this.auditService.record({
      module: MODULE,
      action: 'conversation.tag.delete',
      outcome: 'success',
      userId: user.id,
      organizationId: org,
      description: `tag deleted tag=${tag.uuid}`,
      metadata: { tagId: tag.uuid },
    });
    return { uuid: tag.uuid, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Quick replies (FR-008)
  // ---------------------------------------------------------------------------

  async listQuickReplies(
    user: AuthUser,
    query: QueryQuickRepliesDto,
  ): Promise<ListResult<QuickReplySummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const org = this.orgScope(user);
    const where: Prisma.QuickReplyWhereInput = { deletedAt: null };
    if (org) {
      where.organizationId = org;
    }
    if (query.title) {
      where.title = { startsWith: query.title, mode: 'insensitive' };
    }

    const rawSort = query.sort ?? '-createdAt';
    const sortField = rawSort.replace(/^-/, '');
    if (!QUICK_REPLY_SORT_FIELDS.has(sortField)) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'Invalid sort field' },
      });
    }
    const sortDesc = rawSort.startsWith('-');

    const [total, quickReplies] = await Promise.all([
      this.prisma.quickReply.count({ where }),
      this.prisma.quickReply.findMany({
        where,
        orderBy: { [sortField]: sortDesc ? 'desc' : 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      data: quickReplies.map(toQuickReplySummary),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async createQuickReply(
    user: AuthUser,
    dto: CreateQuickReplyDto,
  ): Promise<QuickReplySummary> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    const quickReply = await this.prisma.quickReply.create({
      data: {
        organizationId: org,
        title: dto.title,
        body: dto.body,
        createdById: user.id,
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quick_reply.create',
      outcome: 'success',
      userId: user.id,
      organizationId: org,
      description: `quick reply created quickReply=${quickReply.uuid}`,
      metadata: { quickReplyId: quickReply.uuid },
    });
    return toQuickReplySummary(quickReply);
  }

  async updateQuickReply(
    user: AuthUser,
    params: QuickReplyPathParamsDto,
    dto: UpdateQuickReplyDto,
  ): Promise<QuickReplySummary> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    const quickReply = await this.prisma.quickReply.findFirst({
      where: { uuid: params.uuid, organizationId: org, deletedAt: null },
    });
    if (!quickReply) {
      throw new NotFoundException({
        error: {
          code: 'QUICK_REPLY_NOT_FOUND',
          message: 'Quick reply not found',
        },
      });
    }
    const updated = await this.prisma.quickReply.update({
      where: { id: quickReply.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quick_reply.update',
      outcome: 'success',
      userId: user.id,
      organizationId: org,
      description: `quick reply updated quickReply=${updated.uuid}`,
      metadata: { quickReplyId: updated.uuid },
    });
    return toQuickReplySummary(updated);
  }

  async deleteQuickReply(
    user: AuthUser,
    params: QuickReplyPathParamsDto,
  ): Promise<{ uuid: string; deleted: boolean }> {
    const org = user.organizationId;
    if (!org) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization is required',
        },
      });
    }
    const quickReply = await this.prisma.quickReply.findFirst({
      where: { uuid: params.uuid, organizationId: org },
    });
    if (!quickReply) {
      throw new NotFoundException({
        error: {
          code: 'QUICK_REPLY_NOT_FOUND',
          message: 'Quick reply not found',
        },
      });
    }
    if (quickReply.deletedAt) {
      return { uuid: quickReply.uuid, deleted: true };
    }
    await this.prisma.quickReply.update({
      where: { id: quickReply.id },
      data: { deletedAt: new Date() },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'quick_reply.delete',
      outcome: 'success',
      userId: user.id,
      organizationId: org,
      description: `quick reply deleted quickReply=${quickReply.uuid}`,
      metadata: { quickReplyId: quickReply.uuid },
    });
    return { uuid: quickReply.uuid, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private orgScope(user: AuthUser): string | undefined {
    return user.accountType === 'ORGANIZATION'
      ? (user.organizationId ?? undefined)
      : undefined;
  }

  private async findScopedConversation(
    user: AuthUser,
    uuid: string,
  ): Promise<{
    id: string;
    uuid: string;
    organizationId: string;
    status: ConversationStatus;
    advisorId: string | null;
  } | null> {
    const org = this.orgScope(user);
    return this.prisma.conversation.findFirst({
      where: {
        uuid,
        ...(org ? { organizationId: org } : {}),
        deletedAt: null,
      },
      select: {
        id: true,
        uuid: true,
        organizationId: true,
        status: true,
        advisorId: true,
      },
    });
  }

  private async findScopedAdvisor(
    organizationId: string,
    uuid: string,
  ): Promise<{
    id: string;
    uuid: string;
    firstName: string;
    lastName: string;
    status: UserStatus;
  } | null> {
    return this.prisma.user.findFirst({
      where: { uuid, organizationId, deletedAt: null },
      select: {
        id: true,
        uuid: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });
  }

  private async findUserUuidById(id: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { uuid: true },
    });
    return user?.uuid ?? null;
  }

  private async findScopedTag(
    organizationId: string,
    uuid: string,
  ): Promise<{ id: string; uuid: string } | null> {
    return this.prisma.conversationTag.findFirst({
      where: { uuid, organizationId, deletedAt: null },
      select: { id: true, uuid: true },
    });
  }

  private async listTagsForConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationTagRef[]> {
    const assignments = await this.prisma.conversationTagAssignment.findMany({
      where: { conversationId, organizationId, deletedAt: null },
      select: { tag: { select: { uuid: true, name: true, color: true } } },
    });
    return assignments.map((assignment) => ({
      uuid: assignment.tag.uuid,
      name: assignment.tag.name,
      color: assignment.tag.color,
    }));
  }

  private conversationNotFound(): NotFoundException {
    return new NotFoundException({
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      },
    });
  }

  private emit<T>(
    event: string,
    userId: string,
    organizationId: string,
    payload: T,
  ): void {
    this.eventEmitter.emit(
      event,
      buildConversationsEvent<T>(
        EVENT_STATES[event],
        userId,
        organizationId,
        payload,
      ),
    );
  }
}

const EVENT_STATES: Record<string, ConversationsEventState> = {
  ConversationAssigned: 'ASSIGNED',
  ConversationTransferred: 'TRANSFERRED',
  ConversationClosed: 'CLOSED',
  ConversationArchived: 'ARCHIVED',
};

function toAdvisorRef(advisor: {
  uuid: string;
  firstName: string;
  lastName: string;
}): AdvisorRef {
  return {
    uuid: advisor.uuid,
    firstName: advisor.firstName,
    lastName: advisor.lastName,
  };
}

function toNoteSummary(note: {
  uuid: string;
  content: string;
  createdAt: Date;
  author: { uuid: string; firstName: string; lastName: string };
}): ConversationNoteSummary {
  return {
    uuid: note.uuid,
    author: {
      uuid: note.author.uuid,
      firstName: note.author.firstName,
      lastName: note.author.lastName,
    },
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  };
}

function toTagSummary(
  tag: {
    uuid: string;
    name: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  conversationCount: number,
): ConversationTagSummary {
  return {
    uuid: tag.uuid,
    name: tag.name,
    color: tag.color,
    conversationCount,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

function toQuickReplySummary(quickReply: {
  uuid: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}): QuickReplySummary {
  return {
    uuid: quickReply.uuid,
    title: quickReply.title,
    body: quickReply.body,
    createdAt: quickReply.createdAt.toISOString(),
    updatedAt: quickReply.updatedAt.toISOString(),
  };
}
