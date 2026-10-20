import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappScheduler } from './whatsapp.scheduler';
import { WhatsappService } from './whatsapp.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

describe('WhatsappScheduler', () => {
  let scheduler: WhatsappScheduler;
  let service: {
    executeDueAutomations: jest.Mock;
    expireStuckExecuting: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    service = {
      executeDueAutomations: jest.fn().mockResolvedValue(undefined),
      expireStuckExecuting: jest.fn().mockResolvedValue(undefined),
    };
    configService = { get: jest.fn().mockReturnValue('development') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappScheduler,
        { provide: WhatsappService, useValue: service },
        { provide: ConfigService, useValue: configService },
        // AUTO-SAFETY-002: default permissive so the existing assertions about
        // the tick still hold. The DENY behaviour is covered by the dedicated
        // test below and by core/safety specs.
        {
          provide: SendPermitGuard,
          useValue: { evaluate: () => ({ allowed: true }) },
        },
      ],
    }).compile();

    scheduler = module.get(WhatsappScheduler);
  });

  it('expires stuck EXECUTING and runs the due-automation execution on each tick', async () => {
    await scheduler.tick();

    expect(service.expireStuckExecuting).toHaveBeenCalledTimes(1);
    expect(service.executeDueAutomations).toHaveBeenCalledTimes(1);
  });

  it('skips execution when the environment is test (NR-012)', async () => {
    configService.get.mockReturnValue('test');

    await scheduler.tick();

    expect(service.expireStuckExecuting).not.toHaveBeenCalled();
    expect(service.executeDueAutomations).not.toHaveBeenCalled();
  });

  // AUTO-SAFETY-002
  describe('política de envío denegada', () => {
    it('no selecciona ni ejecuta automatizaciones', async () => {
      await rebuild({
        evaluate: () => ({ allowed: false, reason: 'SWITCH_DENIED' }),
      });

      await scheduler.tick();

      expect(service.expireStuckExecuting).not.toHaveBeenCalled();
      expect(service.executeDueAutomations).not.toHaveBeenCalled();
    });
  });

  async function rebuild(permit: {
    evaluate: () => { allowed: boolean; reason?: string };
  }) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappScheduler,
        { provide: WhatsappService, useValue: service },
        { provide: ConfigService, useValue: configService },
        { provide: SendPermitGuard, useValue: permit },
      ],
    }).compile();
    scheduler = module.get(WhatsappScheduler);
  }
});
