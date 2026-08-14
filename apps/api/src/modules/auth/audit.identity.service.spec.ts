import { AuditIdentityService } from './audit.identity.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('AuditIdentityService', () => {
  let service: AuditIdentityService;
  let prisma: { audit: { create: jest.Mock } };

  beforeEach(() => {
    prisma = { audit: { create: jest.fn().mockResolvedValue({}) } };
    service = new AuditIdentityService(prisma as unknown as PrismaService);
  });

  it('persists an audit row with module, action, actor and outcome', async () => {
    await service.record({
      action: 'auth.login',
      outcome: 'success',
      userId: 'u-1',
      organizationId: 'org-1',
      description: 'session created',
      metadata: { reason: 'none' },
    });

    expect(prisma.audit.create).toHaveBeenCalledWith({
      data: {
        module: 'identity',
        action: 'auth.login.success',
        userId: 'u-1',
        organizationId: 'org-1',
        description: 'session created',
        metadata: { reason: 'none' },
      },
    });
  });

  it('records null actor and organization for pre-auth events', async () => {
    await service.record({
      action: 'auth.login',
      outcome: 'failure',
      metadata: { reason: 'unknown_email' },
    });

    expect(prisma.audit.create).toHaveBeenCalledWith({
      data: {
        module: 'identity',
        action: 'auth.login.failure',
        userId: null,
        organizationId: null,
        description: undefined,
        metadata: { reason: 'unknown_email' },
      },
    });
  });

  it('redacts sensitive metadata values', async () => {
    await service.record({
      action: 'auth.refresh',
      outcome: 'failure',
      userId: 'u-1',
      metadata: {
        reason: 'reuse',
        refreshToken: 'raw-token-value',
        nested: { password: 'secret' },
      },
    });

    const call = prisma.audit.create.mock.calls[0] as [
      { data: { metadata: Record<string, unknown> } },
    ];
    expect(call[0].data.metadata).toEqual({
      reason: 'reuse',
      refreshToken: '[REDACTED]',
      nested: { password: '[REDACTED]' },
    });
  });

  it('never throws when the persistence fails', async () => {
    prisma.audit.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({ action: 'auth.login', outcome: 'success' }),
    ).resolves.toBeUndefined();
  });
});
