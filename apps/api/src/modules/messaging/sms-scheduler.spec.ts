import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { SmsScheduler } from './sms-scheduler';
import { SmsExecutionService } from './sms-execution.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

/**
 * AUTO-SAFETY-004 — verifying que el scheduler de SMS no procesa envíos
 * cuando la política efectiva es DENIED.
 *
 * Todos los dobles son en memoria: ninguna prueba de este archivo toca la base
 * de datos, la red ni el proveedor.
 */
describe('SmsScheduler · política de salida', () => {
  let scheduler: SmsScheduler;
  let executionService: { executeOneAutomation: jest.Mock };
  let prisma: { automation: { findMany: jest.Mock; updateMany: jest.Mock } };
  let configService: { get: jest.Mock };
  let permit: { evaluate: jest.Mock; assert: jest.Mock };

  async function build(allowed: boolean, reason?: string): Promise<void> {
    executionService = {
      executeOneAutomation: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      automation: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    configService = { get: jest.fn().mockReturnValue('production') };
    permit = {
      evaluate: jest.fn(() =>
        allowed
          ? { allowed: true }
          : { allowed: false, reason: reason ?? 'SWITCH_DENIED' },
      ),
      assert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsScheduler,
        { provide: SmsExecutionService, useValue: executionService },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: SendPermitGuard, useValue: permit },
      ],
    }).compile();

    scheduler = module.get(SmsScheduler);
  }

  describe('con política DENIED', () => {
    beforeEach(async () => {
      await build(false);
    });

    it('no selecciona automatizaciones pendientes', async () => {
      await scheduler.tick();

      expect(permit.evaluate).toHaveBeenCalledWith(null, 'SMS');
      expect(prisma.automation.findMany).not.toHaveBeenCalled();
      expect(executionService.executeOneAutomation).not.toHaveBeenCalled();
    });

    it('la recuperación de ejecuciones atascadas no consume reintentos', async () => {
      // expireStuckExecuting es lo único que pasa EXECUTING -> ERROR con
      // retryCount++. Bajo DENIED no debe ejecutarse: un bloqueo de seguridad no
      // puede consumirse como si fuera un fallo del proveedor.
      await scheduler.tick();

      expect(prisma.automation.updateMany).not.toHaveBeenCalled();
      expect(prisma.automation.findMany).not.toHaveBeenCalled();
    });

    it('no produce ninguna llamada al proveedor de SMS', async () => {
      await scheduler.tick();

      expect(executionService.executeOneAutomation).not.toHaveBeenCalled();
    });
  });

  describe('con política ENABLED', () => {
    beforeEach(async () => {
      await build(true);
    });

    it('consulta la política y ejecuta el tick con normalidad', async () => {
      await scheduler.tick();

      expect(permit.evaluate).toHaveBeenCalledWith(null, 'SMS');
      expect(prisma.automation.findMany).toHaveBeenCalled();
    });
  });

  it('en entorno de test no hace nada, con independencia de la política', async () => {
    await build(true);
    configService.get.mockReturnValue('test');

    await scheduler.tick();

    expect(prisma.automation.findMany).not.toHaveBeenCalled();
    expect(executionService.executeOneAutomation).not.toHaveBeenCalled();
  });
});
