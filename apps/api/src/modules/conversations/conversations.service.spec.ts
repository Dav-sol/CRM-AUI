import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ConversationsService } from './conversations.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

const now = '2026-08-17T12:00:00.000Z';

function p2002(message = ''): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: {
    conversation: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findFirst: jest.Mock; findUnique: jest.Mock };
    conversationTag: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    conversationTagAssignment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      groupBy: jest.Mock;
      count: jest.Mock;
    };
    conversationNote: { create: jest.Mock; findMany: jest.Mock };
    quickReply: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let whatsappService: { sendReply: jest.Mock };

  const conversation = {
    id: 'co-1',
    uuid: 'cou-1',
    organizationId: 'org-1',
    status: 'OPEN',
    advisorId: null,
  };

  const advisor = {
    id: 'adv-1',
    uuid: 'advu-1',
    firstName: 'Ana',
    lastName: 'Lopez',
    status: 'ACTIVE',
  };

  const advisorRef = { uuid: 'advu-1', firstName: 'Ana', lastName: 'Lopez' };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findFirst: jest.fn(), findUnique: jest.fn() },
      conversationTag: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      conversationTagAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      conversationNote: { create: jest.fn(), findMany: jest.fn() },
      quickReply: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };
    whatsappService = { sendReply: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: auditService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    service = module.get(ConversationsService);
  });

  const emittedNames = (): string[] =>
    eventEmitter.emit.mock.calls.map((call) => (call as string[])[0]);

  describe('reply (US3, FR-003)', () => {
    it('delegates to whatsapp sendReply and returns the message', async () => {
      const message = { uuid: 'm-1', status: 'SENT', type: 'OUTGOING' };
      whatsappService.sendReply.mockResolvedValue(message);
      const result = await service.reply(
        orgUser,
        { uuid: 'cou-1' },
        {
          content: 'Hola',
        },
      );
      expect(whatsappService.sendReply).toHaveBeenCalledWith(
        orgUser,
        'cou-1',
        'Hola',
        undefined,
      );
      expect(result).toBe(message);
    });

    it('passes the idempotency key through', async () => {
      whatsappService.sendReply.mockResolvedValue({ uuid: 'm-1' });
      await service.reply(
        orgUser,
        { uuid: 'cou-1' },
        { content: 'Hola' },
        'key-1',
      );
      expect(whatsappService.sendReply).toHaveBeenCalledWith(
        orgUser,
        'cou-1',
        'Hola',
        'key-1',
      );
    });

    it('throws 404 QUICK_REPLY_NOT_FOUND when quickReplyId is not in tenant', async () => {
      prisma.quickReply.findFirst.mockResolvedValue(null);
      await expect(
        service.reply(
          orgUser,
          { uuid: 'cou-1' },
          {
            content: 'Hola',
            quickReplyId: 'qr-1',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('audits quick reply use when the id is valid', async () => {
      prisma.quickReply.findFirst.mockResolvedValue({ uuid: 'qr-1' });
      whatsappService.sendReply.mockResolvedValue({ uuid: 'm-1' });
      await service.reply(
        orgUser,
        { uuid: 'cou-1' },
        {
          content: 'Hola',
          quickReplyId: 'qr-1',
        },
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'quick_reply.use',
          metadata: { quickReplyId: 'qr-1' },
        }),
      );
    });

    it('throws 404 CONVERSATION_NOT_FOUND when sendReply returns null', async () => {
      whatsappService.sendReply.mockResolvedValue(null);
      await expect(
        service.reply(orgUser, { uuid: 'cou-1' }, { content: 'Hola' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assign (US4, FR-004)', () => {
    it('assigns the advisor and emits ConversationAssigned', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.user.findFirst.mockResolvedValue(advisor);
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.assign(
        orgUser,
        { uuid: 'cou-1' },
        {
          advisorId: 'advu-1',
        },
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'co-1' },
        data: { advisorId: 'adv-1' },
      });
      expect(result).toEqual({ uuid: 'cou-1', advisor: advisorRef });
      expect(emittedNames()).toContain('ConversationAssigned');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.assign' }),
      );
    });

    it('is a no-op when the same advisor is assigned (no event)', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        advisorId: 'adv-1',
      });
      prisma.user.findFirst.mockResolvedValue(advisor);
      const result = await service.assign(
        orgUser,
        { uuid: 'cou-1' },
        {
          advisorId: 'advu-1',
        },
      );
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(emittedNames()).not.toContain('ConversationAssigned');
      expect(result).toEqual({ uuid: 'cou-1', advisor: advisorRef });
    });

    it('throws 400 when the advisor is not in the conversation organization', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.assign(
          orgUser,
          { uuid: 'cou-1' },
          {
            advisorId: 'advu-1',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when the advisor is suspended', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.user.findFirst.mockResolvedValue({
        ...advisor,
        status: 'SUSPENDED',
      });
      await expect(
        service.assign(
          orgUser,
          { uuid: 'cou-1' },
          {
            advisorId: 'advu-1',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when the conversation is not found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(
        service.assign(
          orgUser,
          { uuid: 'cou-1' },
          {
            advisorId: 'advu-1',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transfer (US4, FR-004)', () => {
    it('transfers and emits ConversationTransferred with from advisor', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        advisorId: 'adv-1',
      });
      prisma.user.findFirst.mockResolvedValue({ ...advisor, id: 'adv-2' });
      prisma.user.findUnique.mockResolvedValue({ uuid: 'advu-1' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.transfer(
        orgUser,
        { uuid: 'cou-1' },
        {
          advisorId: 'advu-1',
        },
      );
      expect(emittedNames()).toContain('ConversationTransferred');
      const envelope = (
        eventEmitter.emit.mock.calls as Array<
          [
            string,
            { payload: { fromAdvisorId: string | null; toAdvisorId: string } },
          ]
        >
      ).find((call) => call[0] === 'ConversationTransferred')![1];
      expect(envelope.payload.fromAdvisorId).toBe('advu-1');
      expect(envelope.payload.toAdvisorId).toBe('advu-1');
      expect(result).toEqual({ uuid: 'cou-1', advisor: advisorRef });
    });

    it('is a no-op when the target equals the current advisor', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        advisorId: 'adv-1',
      });
      prisma.user.findFirst.mockResolvedValue(advisor);
      const result = await service.transfer(
        orgUser,
        { uuid: 'cou-1' },
        {
          advisorId: 'advu-1',
        },
      );
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(emittedNames()).not.toContain('ConversationTransferred');
      expect(result).toEqual({ uuid: 'cou-1', advisor: advisorRef });
    });
  });

  describe('close (US5, FR-005)', () => {
    it('closes an OPEN conversation and emits ConversationClosed', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.close(orgUser, { uuid: 'cou-1' });
      expect(result).toEqual({ uuid: 'cou-1', status: 'CLOSED' });
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'co-1', status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      expect(emittedNames()).toContain('ConversationClosed');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.close' }),
      );
    });

    it('throws 400 when the conversation is not OPEN', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        status: 'CLOSED',
      });
      prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.close(orgUser, { uuid: 'cou-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('archive (US5, FR-005)', () => {
    it('archives an OPEN/CLOSED conversation and emits ConversationArchived', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.archive(orgUser, { uuid: 'cou-1' });
      expect(result).toEqual({ uuid: 'cou-1', status: 'ARCHIVED' });
      expect(emittedNames()).toContain('ConversationArchived');
    });

    it('throws 400 when already ARCHIVED', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        status: 'ARCHIVED',
      });
      prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.archive(orgUser, { uuid: 'cou-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reopen (US5, FR-005)', () => {
    it('reopens a CLOSED/ARCHIVED conversation (no event)', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...conversation,
        status: 'ARCHIVED',
      });
      prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.reopen(orgUser, { uuid: 'cou-1' });
      expect(result).toEqual({ uuid: 'cou-1', status: 'OPEN' });
      expect(emittedNames()).not.toContain('ConversationClosed');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.reopen' }),
      );
    });

    it('throws 400 when already OPEN', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.reopen(orgUser, { uuid: 'cou-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('notes (US7, FR-007)', () => {
    it('creates an append-only note with the author', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationNote.create.mockResolvedValue({
        uuid: 'n-1',
        content: 'Cliente pide factura',
        createdAt: new Date(now),
        author: { uuid: 'uu-1', firstName: 'Ana', lastName: 'Lopez' },
      });
      const result = await service.addNote(
        orgUser,
        { uuid: 'cou-1' },
        {
          content: 'Cliente pide factura',
        },
      );
      expect(prisma.conversationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            conversationId: 'co-1',
            userId: 'u-1',
            content: 'Cliente pide factura',
          }) as unknown,
        }),
      );
      expect(result).toEqual({
        uuid: 'n-1',
        author: { uuid: 'uu-1', firstName: 'Ana', lastName: 'Lopez' },
        content: 'Cliente pide factura',
        createdAt: now,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.note.create' }),
      );
    });

    it('throws 404 for a cross-tenant conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(
        service.addNote(orgUser, { uuid: 'cou-1' }, { content: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lists notes in chronological order', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationNote.findMany.mockResolvedValue([
        {
          uuid: 'n-1',
          content: 'uno',
          createdAt: new Date(now),
          author: { uuid: 'uu-1', firstName: 'A', lastName: 'L' },
        },
      ]);
      const result = await service.listNotes(orgUser, { uuid: 'cou-1' });
      expect(result).toHaveLength(1);
      expect(prisma.conversationNote.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'co-1', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: expect.anything() as unknown,
      });
    });
  });

  describe('tags (US6, FR-006)', () => {
    it('assigns a tag to a conversation and returns the tag list', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
      });
      prisma.conversationTagAssignment.findFirst.mockResolvedValue(null);
      prisma.conversationTagAssignment.create.mockResolvedValue({});
      prisma.conversationTagAssignment.findMany.mockResolvedValue([
        { tag: { uuid: 'tagu-1', name: 'VIP', color: '#0EA5E9' } },
      ]);
      const result = await service.assignTag(
        orgUser,
        { uuid: 'cou-1' },
        { tagUuid: 'tagu-1' },
      );
      expect(result.tags).toEqual([
        { uuid: 'tagu-1', name: 'VIP', color: '#0EA5E9' },
      ]);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.tag.assign' }),
      );
    });

    it('is a no-op when the tag is already assigned', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
      });
      prisma.conversationTagAssignment.findFirst.mockResolvedValue({
        id: 'a-1',
      });
      prisma.conversationTagAssignment.findMany.mockResolvedValue([]);
      const result = await service.assignTag(
        orgUser,
        { uuid: 'cou-1' },
        { tagUuid: 'tagu-1' },
      );
      expect(prisma.conversationTagAssignment.create).not.toHaveBeenCalled();
      expect(result.tags).toEqual([]);
    });

    it('handles P2002 race by reviving the soft-deleted assignment', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
      });
      prisma.conversationTagAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.conversationTagAssignment.create.mockRejectedValue(p2002());
      prisma.conversationTagAssignment.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.conversationTagAssignment.findMany.mockResolvedValue([]);
      const result = await service.assignTag(
        orgUser,
        { uuid: 'cou-1' },
        { tagUuid: 'tagu-1' },
      );
      expect(prisma.conversationTagAssignment.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'co-1', tagId: 'tag-1' },
        data: {
          deletedAt: null,
          createdById: 'u-1',
          updatedAt: expect.any(Date) as unknown,
        },
      });
      expect(result.tags).toEqual([]);
    });

    it('throws 404 TAG_NOT_FOUND when the tag is not in tenant', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationTag.findFirst.mockResolvedValue(null);
      await expect(
        service.assignTag(orgUser, { uuid: 'cou-1' }, { tagUuid: 'tagu-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes a tag assignment (soft delete)', async () => {
      prisma.conversation.findFirst.mockResolvedValue(conversation);
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
      });
      prisma.conversationTagAssignment.updateMany.mockResolvedValue({
        count: 1,
      });
      prisma.conversationTagAssignment.findMany.mockResolvedValue([]);
      const result = await service.removeTag(
        orgUser,
        { uuid: 'cou-1' },
        { tagUuid: 'tagu-1' },
      );
      expect(prisma.conversationTagAssignment.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'co-1', tagId: 'tag-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) as unknown },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.tag.remove' }),
      );
      expect(result.tags).toEqual([]);
    });
  });

  describe('tag catalog (US6, FR-006)', () => {
    it('lists tags with conversation counts', async () => {
      prisma.conversationTag.count.mockResolvedValue(1);
      prisma.conversationTag.findMany.mockResolvedValue([
        {
          id: 'tag-1',
          uuid: 'tagu-1',
          name: 'VIP',
          color: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      ]);
      prisma.conversationTagAssignment.groupBy.mockResolvedValue([
        { tagId: 'tag-1', _count: { _all: 3 } },
      ]);
      const result = await service.listTags(orgUser, {});
      expect(result.data[0]).toEqual({
        uuid: 'tagu-1',
        name: 'VIP',
        color: null,
        conversationCount: 3,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('sorts by conversationCount in JS', async () => {
      prisma.conversationTag.count.mockResolvedValue(2);
      prisma.conversationTag.findMany.mockResolvedValue([
        {
          id: 'tag-1',
          uuid: 'tagu-1',
          name: 'A',
          color: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
        {
          id: 'tag-2',
          uuid: 'tagu-2',
          name: 'B',
          color: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      ]);
      prisma.conversationTagAssignment.groupBy.mockResolvedValue([
        { tagId: 'tag-1', _count: { _all: 1 } },
        { tagId: 'tag-2', _count: { _all: 5 } },
      ]);
      const result = await service.listTags(orgUser, {
        sort: '-conversationCount',
      });
      expect(result.data.map((t) => t.uuid)).toEqual(['tagu-2', 'tagu-1']);
    });

    it('rejects an invalid sort field', async () => {
      await expect(
        service.listTags(orgUser, { sort: 'bogus' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a tag', async () => {
      prisma.conversationTag.create.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
        name: 'VIP',
        color: '#0EA5E9',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
      const result = await service.createTag(orgUser, {
        name: 'VIP',
        color: '#0EA5E9',
      });
      expect(result.uuid).toBe('tagu-1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.tag.create' }),
      );
    });

    it('throws 409 TAG_NAME_EXISTS on duplicate name', async () => {
      prisma.conversationTag.create.mockRejectedValue(p2002());
      await expect(service.createTag(orgUser, { name: 'VIP' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('updates a tag', async () => {
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
        organizationId: 'org-1',
        name: 'VIP',
        color: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        deletedAt: null,
      });
      prisma.conversationTag.update.mockResolvedValue({
        uuid: 'tagu-1',
        name: 'VIP+',
        color: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
      prisma.conversationTagAssignment.count.mockResolvedValue(2);
      const result = await service.updateTag(
        orgUser,
        { uuid: 'tagu-1' },
        {
          name: 'VIP+',
        },
      );
      expect(result.name).toBe('VIP+');
      expect(result.conversationCount).toBe(2);
    });

    it('throws 404 when updating a missing tag', async () => {
      prisma.conversationTag.findFirst.mockResolvedValue(null);
      await expect(
        service.updateTag(orgUser, { uuid: 'tagu-1' }, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes a tag and its active assignments', async () => {
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
        deletedAt: null,
      });
      prisma.$transaction.mockResolvedValue([{ count: 2 }, { id: 'tag-1' }]);
      const result = await service.deleteTag(orgUser, { uuid: 'tagu-1' });
      expect(result).toEqual({ uuid: 'tagu-1', deleted: true });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'conversation.tag.delete' }),
      );
    });

    it('is a no-op when the tag is already deleted', async () => {
      prisma.conversationTag.findFirst.mockResolvedValue({
        id: 'tag-1',
        uuid: 'tagu-1',
        deletedAt: new Date(),
      });
      const result = await service.deleteTag(orgUser, { uuid: 'tagu-1' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ uuid: 'tagu-1', deleted: true });
    });
  });

  describe('quick replies (US8, FR-008)', () => {
    it('lists quick replies', async () => {
      prisma.quickReply.count.mockResolvedValue(1);
      prisma.quickReply.findMany.mockResolvedValue([
        {
          uuid: 'qr-1',
          title: 'Confirmación',
          body: 'Hola',
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      ]);
      const result = await service.listQuickReplies(orgUser, {});
      expect(result.data[0]).toEqual({
        uuid: 'qr-1',
        title: 'Confirmación',
        body: 'Hola',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('creates a quick reply', async () => {
      prisma.quickReply.create.mockResolvedValue({
        uuid: 'qr-1',
        title: 'Confirmación',
        body: 'Hola',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
      const result = await service.createQuickReply(orgUser, {
        title: 'Confirmación',
        body: 'Hola',
      });
      expect(result.uuid).toBe('qr-1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'quick_reply.create' }),
      );
    });

    it('updates a quick reply', async () => {
      prisma.quickReply.findFirst.mockResolvedValue({
        id: 'qr-id',
        uuid: 'qr-1',
        deletedAt: null,
      });
      prisma.quickReply.update.mockResolvedValue({
        uuid: 'qr-1',
        title: 'Nuevo',
        body: 'Hola',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
      const result = await service.updateQuickReply(
        orgUser,
        { uuid: 'qr-1' },
        {
          title: 'Nuevo',
        },
      );
      expect(result.title).toBe('Nuevo');
    });

    it('throws 404 when updating a missing quick reply', async () => {
      prisma.quickReply.findFirst.mockResolvedValue(null);
      await expect(
        service.updateQuickReply(
          orgUser,
          { uuid: 'qr-1' },
          {
            title: 'X',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes a quick reply', async () => {
      prisma.quickReply.findFirst.mockResolvedValue({
        id: 'qr-id',
        uuid: 'qr-1',
        deletedAt: null,
      });
      prisma.quickReply.update.mockResolvedValue({});
      const result = await service.deleteQuickReply(orgUser, { uuid: 'qr-1' });
      expect(result).toEqual({ uuid: 'qr-1', deleted: true });
    });

    it('is a no-op when the quick reply is already deleted', async () => {
      prisma.quickReply.findFirst.mockResolvedValue({
        id: 'qr-id',
        uuid: 'qr-1',
        deletedAt: new Date(),
      });
      const result = await service.deleteQuickReply(orgUser, { uuid: 'qr-1' });
      expect(prisma.quickReply.update).not.toHaveBeenCalled();
      expect(result).toEqual({ uuid: 'qr-1', deleted: true });
    });
  });
});
