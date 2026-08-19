import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: {
    reply: jest.Mock;
    assign: jest.Mock;
    transfer: jest.Mock;
    close: jest.Mock;
    archive: jest.Mock;
    reopen: jest.Mock;
    addNote: jest.Mock;
    listNotes: jest.Mock;
    assignTag: jest.Mock;
    removeTag: jest.Mock;
    listTags: jest.Mock;
    createTag: jest.Mock;
    updateTag: jest.Mock;
    deleteTag: jest.Mock;
    listQuickReplies: jest.Mock;
    createQuickReply: jest.Mock;
    updateQuickReply: jest.Mock;
    deleteQuickReply: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      reply: jest.fn(),
      assign: jest.fn(),
      transfer: jest.fn(),
      close: jest.fn(),
      archive: jest.fn(),
      reopen: jest.fn(),
      addNote: jest.fn(),
      listNotes: jest.fn(),
      assignTag: jest.fn(),
      removeTag: jest.fn(),
      listTags: jest.fn(),
      createTag: jest.fn(),
      updateTag: jest.fn(),
      deleteTag: jest.fn(),
      listQuickReplies: jest.fn(),
      createQuickReply: jest.fn(),
      updateQuickReply: jest.fn(),
      deleteQuickReply: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [{ provide: ConversationsService, useValue: service }],
    }).compile();

    controller = module.get(ConversationsController);
  });

  it('wraps the reply in the data envelope and forwards the idempotency key', async () => {
    service.reply.mockResolvedValue({ uuid: 'm-1', status: 'SENT' });
    const result = await controller.reply(user, { uuid: 'cou-1' }, 'idem-1', {
      content: 'Hola',
      quickReplyId: 'qr-1',
    });
    expect(service.reply).toHaveBeenCalledWith(
      user,
      { uuid: 'cou-1' },
      { content: 'Hola', quickReplyId: 'qr-1' },
      'idem-1',
    );
    expect(result).toEqual({ data: { uuid: 'm-1', status: 'SENT' } });
  });

  it('wraps assign in the data envelope', async () => {
    service.assign.mockResolvedValue({
      uuid: 'cou-1',
      advisor: { uuid: 'a-1' },
    });
    const result = await controller.assign(
      user,
      { uuid: 'cou-1' },
      {
        advisorId: 'a-1',
      },
    );
    expect(result).toEqual({
      data: { uuid: 'cou-1', advisor: { uuid: 'a-1' } },
    });
  });

  it('wraps transfer/close/archive/reopen in the data envelope', async () => {
    service.transfer.mockResolvedValue({
      uuid: 'cou-1',
      advisor: { uuid: 'a-1' },
    });
    service.close.mockResolvedValue({ uuid: 'cou-1', status: 'CLOSED' });
    service.archive.mockResolvedValue({ uuid: 'cou-1', status: 'ARCHIVED' });
    service.reopen.mockResolvedValue({ uuid: 'cou-1', status: 'OPEN' });

    expect(
      await controller.transfer(user, { uuid: 'cou-1' }, { advisorId: 'a-1' }),
    ).toEqual({ data: { uuid: 'cou-1', advisor: { uuid: 'a-1' } } });
    expect(await controller.close(user, { uuid: 'cou-1' })).toEqual({
      data: { uuid: 'cou-1', status: 'CLOSED' },
    });
    expect(await controller.archive(user, { uuid: 'cou-1' })).toEqual({
      data: { uuid: 'cou-1', status: 'ARCHIVED' },
    });
    expect(await controller.reopen(user, { uuid: 'cou-1' })).toEqual({
      data: { uuid: 'cou-1', status: 'OPEN' },
    });
  });

  it('wraps notes create/list and tag assign/remove in the data envelope', async () => {
    service.addNote.mockResolvedValue({ uuid: 'n-1', content: 'x' });
    service.listNotes.mockResolvedValue([{ uuid: 'n-1' }]);
    service.assignTag.mockResolvedValue({ uuid: 'cou-1', tags: [] });
    service.removeTag.mockResolvedValue({ uuid: 'cou-1', tags: [] });

    expect(
      await controller.addNote(user, { uuid: 'cou-1' }, { content: 'x' }),
    ).toEqual({ data: { uuid: 'n-1', content: 'x' } });
    expect(await controller.listNotes(user, { uuid: 'cou-1' })).toEqual({
      data: [{ uuid: 'n-1' }],
    });
    expect(
      await controller.assignTag(user, { uuid: 'cou-1' }, { tagUuid: 't-1' }),
    ).toEqual({ data: { uuid: 'cou-1', tags: [] } });
    expect(
      await controller.removeTag(user, { uuid: 'cou-1' }, { tagUuid: 't-1' }),
    ).toEqual({ data: { uuid: 'cou-1', tags: [] } });
  });

  it('returns the tag catalog list envelope', async () => {
    service.listTags.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
    expect(await controller.listTags(user, {})).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });

  it('wraps catalog create/update/delete in the data envelope', async () => {
    service.createTag.mockResolvedValue({ uuid: 't-1', name: 'VIP' });
    service.updateTag.mockResolvedValue({ uuid: 't-1', name: 'VIP' });
    service.deleteTag.mockResolvedValue({ uuid: 't-1', deleted: true });
    service.createQuickReply.mockResolvedValue({ uuid: 'qr-1', title: 'T' });
    service.updateQuickReply.mockResolvedValue({ uuid: 'qr-1', title: 'T' });
    service.deleteQuickReply.mockResolvedValue({ uuid: 'qr-1', deleted: true });

    expect(await controller.createTag(user, { name: 'VIP' })).toEqual({
      data: { uuid: 't-1', name: 'VIP' },
    });
    expect(
      await controller.updateTag(
        user,
        { uuid: 't-1' },
        {
          name: 'VIP',
        },
      ),
    ).toEqual({ data: { uuid: 't-1', name: 'VIP' } });
    expect(await controller.deleteTag(user, { uuid: 't-1' })).toEqual({
      data: { uuid: 't-1', deleted: true },
    });
    expect(
      await controller.createQuickReply(user, {
        title: 'T',
        body: 'B',
      }),
    ).toEqual({ data: { uuid: 'qr-1', title: 'T' } });
    expect(
      await controller.updateQuickReply(
        user,
        { uuid: 'qr-1' },
        {
          title: 'T',
        },
      ),
    ).toEqual({ data: { uuid: 'qr-1', title: 'T' } });
    expect(await controller.deleteQuickReply(user, { uuid: 'qr-1' })).toEqual({
      data: { uuid: 'qr-1', deleted: true },
    });
  });

  it('returns the quick replies list envelope', async () => {
    service.listQuickReplies.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
    expect(await controller.listQuickReplies(user, {})).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });

  it('leaves reply/assign/transfer/transitions/notes/tag-assign open to all roles (no ROLES metadata)', () => {
    const proto = ConversationsController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;

    for (const handler of [
      'reply',
      'assign',
      'transfer',
      'close',
      'archive',
      'reopen',
      'addNote',
      'listNotes',
      'assignTag',
      'removeTag',
      'listTags',
      'listQuickReplies',
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toBeUndefined();
    }
  });

  it('restricts catalog management to ADMINISTRADOR/GERENTE', () => {
    const proto = ConversationsController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;

    for (const handler of ['createTag', 'updateTag', 'deleteTag']) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toEqual([
        'ADMINISTRADOR',
        'GERENTE',
      ]);
    }
    for (const handler of [
      'createQuickReply',
      'updateQuickReply',
      'deleteQuickReply',
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toEqual([
        'ADMINISTRADOR',
        'GERENTE',
      ]);
    }
  });
});
