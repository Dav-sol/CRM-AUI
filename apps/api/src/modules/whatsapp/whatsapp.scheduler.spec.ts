import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappScheduler } from './whatsapp.scheduler';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappScheduler', () => {
  let scheduler: WhatsappScheduler;
  let service: { executeDueAutomations: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    service = { executeDueAutomations: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue('development') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappScheduler,
        { provide: WhatsappService, useValue: service },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    scheduler = module.get(WhatsappScheduler);
  });

  it('runs the due-automation execution on each tick', async () => {
    await scheduler.tick();

    expect(service.executeDueAutomations).toHaveBeenCalledTimes(1);
  });

  it('skips execution when the environment is test (NR-012)', async () => {
    configService.get.mockReturnValue('test');

    await scheduler.tick();

    expect(service.executeDueAutomations).not.toHaveBeenCalled();
  });
});
