import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

const user: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'OPERADOR',
};

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: {
    listConversations: jest.Mock;
    getConversation: jest.Mock;
    listMessages: jest.Mock;
    getMessage: jest.Mock;
    sendManualMessage: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listConversations: jest.fn(),
      getConversation: jest.fn(),
      listMessages: jest.fn(),
      getMessage: jest.fn(),
      sendManualMessage: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [{ provide: WhatsappService, useValue: service }],
    }).compile();

    controller = module.get(WhatsappController);
  });

  it('returns the paginated conversation list envelope', async () => {
    service.listConversations.mockResolvedValue({
      data: [{ uuid: 'conv-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.listConversations(user, {});

    expect(service.listConversations).toHaveBeenCalledWith(user, {});
    expect(result).toEqual({
      data: [{ uuid: 'conv-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('throws CONVERSATION_NOT_FOUND when the conversation does not exist', async () => {
    service.getConversation.mockResolvedValue(null);

    await expect(
      controller.getConversation(user, { uuid: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the conversation detail envelope', async () => {
    service.getConversation.mockResolvedValue({
      uuid: 'conv-1',
      messages: [],
    });

    const result = await controller.getConversation(user, { uuid: 'conv-1' });

    expect(service.getConversation).toHaveBeenCalledWith(user, {
      uuid: 'conv-1',
    });
    expect(result).toEqual({ data: { uuid: 'conv-1', messages: [] } });
  });

  it('returns the paginated message list envelope', async () => {
    service.listMessages.mockResolvedValue({
      data: [{ uuid: 'm-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    const result = await controller.listMessages(user, {});

    expect(service.listMessages).toHaveBeenCalledWith(user, {});
    expect(result).toEqual({
      data: [{ uuid: 'm-1' }],
      meta: { page: 1, limit: 20, total: 1, pages: 1 },
    });
  });

  it('throws MESSAGE_NOT_FOUND when the message does not exist', async () => {
    service.getMessage.mockResolvedValue(null);

    await expect(
      controller.getMessage(user, { uuid: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the message detail envelope', async () => {
    service.getMessage.mockResolvedValue({ uuid: 'm-1' });

    const result = await controller.getMessage(user, { uuid: 'm-1' });

    expect(service.getMessage).toHaveBeenCalledWith(user, 'm-1');
    expect(result).toEqual({ data: { uuid: 'm-1' } });
  });

  it('sends a manual message for any role (HG-11) and forwards the idempotency key', async () => {
    service.sendManualMessage.mockResolvedValue({
      uuid: 'm-1',
      status: 'SENT',
    });

    const result = await controller.sendMessage(user, 'idem-key-1', {
      customerId: 'cu-1',
      content: 'Hola',
    });

    expect(service.sendManualMessage).toHaveBeenCalledWith(
      user,
      { customerId: 'cu-1', content: 'Hola' },
      'idem-key-1',
    );
    expect(result).toEqual({ data: { uuid: 'm-1', status: 'SENT' } });
  });

  it('leaves reads and manual send open to all roles (no ROLES metadata)', () => {
    const proto = WhatsappController.prototype as unknown as Record<
      string,
      (this: void) => unknown
    >;

    for (const handler of [
      'listConversations',
      'getConversation',
      'listMessages',
      'getMessage',
      'sendMessage',
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[handler])).toBeUndefined();
    }
  });
});
