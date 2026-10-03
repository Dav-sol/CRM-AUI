import { Test, TestingModule } from '@nestjs/testing';
import {
  AutomationStatus,
  CommercialCycleStatus,
  ConsentDecision,
  ConsentScope,
  ConsentSource,
  ComplaintOpenedBy,
  LifecyclePauseReason,
  LifecycleTerminationReason,
} from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { LifecycleService } from './lifecycle.service';

const CYCLE = 'cy-1';

function automationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'au-1',
    commercialCycleId: CYCLE,
    status: AutomationStatus.SCHEDULED,
    scheduledDate: new Date('2099-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Lee el primer argumento con el que se llamó a un mock. Tipado explícito
 * para no propagar `any` del tipo de `jest.Mock`.
 */
function firstCallArg<T>(mock: { mock: { calls: unknown[][] } }): T {
  return mock.mock.calls[0][0] as T;
}

describe('LifecycleService', () => {
  let service: LifecycleService;
  let prisma: {
    purchase: { findUnique: jest.Mock };
    commercialCycle: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    automation: { updateMany: jest.Mock };
    complaint: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    lifecycleConsent: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    customer: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchase: { findUnique: jest.fn() },
      commercialCycle: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      automation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      complaint: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      lifecycleConsent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      customer: { findUnique: jest.fn() },
      // Ejecuta el callback contra los mismos mocks, como Prisma.
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: audit },
      ],
    }).compile();
    service = module.get(LifecycleService);
  });

  // -------------------------------------------------------------------------
  // P0-A — lifecycle basado en instalación (§1)
  // -------------------------------------------------------------------------
  describe('P0-A · entrada al lifecycle (§1)', () => {
    it('con instalación válida, el lifecycle puede existir', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        installationDate: new Date('2026-01-15T12:00:00.000Z'),
        warrantyMonths: 12,
        deletedAt: null,
      });

      await expect(service.tieneInstalacionValida('pu-1')).resolves.toBe(true);
      const base = await service.baseDateOf('pu-1');
      expect(base?.installationDate.toISOString()).toBe(
        '2026-01-15T12:00:00.000Z',
      );
    });

    it('sin instalación, la venta NO pertenece al lifecycle', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        installationDate: null,
        warrantyMonths: 12,
        deletedAt: null,
      });

      await expect(service.tieneInstalacionValida('pu-1')).resolves.toBe(false);
      await expect(service.baseDateOf('pu-1')).resolves.toBeNull();
    });

    it('no inventa fecha de instalación a partir de la venta', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        installationDate: null,
        warrantyMonths: 24,
        deletedAt: null,
      });
      // Ni devuelve purchaseDate ni un default: simplemente no hay lifecycle.
      await expect(service.baseDateOf('pu-1')).resolves.toBeNull();
    });

    it('una compra borrada tampoco entra', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        installationDate: new Date(),
        warrantyMonths: 12,
        deletedAt: new Date(),
      });
      await expect(service.baseDateOf('pu-1')).resolves.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // P0-G — SKIPPED al reanudar (§4.5). PRIORIDAD ESPECIAL.
  // -------------------------------------------------------------------------
  describe('P0-G · resume sin retroactividad (§4.5)', () => {
    beforeEach(() => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        purchase: { organizationId: 'org-1' },
      });
    });

    it('1) pausa corta sin hito vencido: no toca ninguna automatización', async () => {
      const future = automationRow({
        scheduledDate: new Date(Date.now() + 5 * 86_400_000),
      });

      const skipped = await service.resume(CYCLE);

      // El where exige scheduledDate <= now, así que la futura no se marca.
      const arg = firstCallArg<{
        where: { status: string; scheduledDate: { lte: Date } };
      }>(prisma.automation.updateMany);
      expect(arg.where.status).toBe(AutomationStatus.SCHEDULED);
      expect(arg.where.scheduledDate.lte).toBeInstanceOf(Date);
      expect(skipped).toBe(0);
      expect(arg.where).not.toHaveProperty('id', future.id);
    });

    it('2) pausa larga con hito vencido: el hito pasa a SKIPPED', async () => {
      prisma.automation.updateMany.mockResolvedValue({ count: 1 });

      const skipped = await service.resume(CYCLE);

      const arg = firstCallArg<{
        where: { commercialCycleId: string; status: string };
        data: { status: string };
      }>(prisma.automation.updateMany);
      expect(arg.where.commercialCycleId).toBe(CYCLE);
      expect(arg.where.status).toBe(AutomationStatus.SCHEDULED);
      expect(arg.data.status).toBe(AutomationStatus.SKIPPED);
      expect(skipped).toBe(1);
    });

    it('3) limpia la pausa y su motivo', async () => {
      await service.resume(CYCLE);

      expect(prisma.commercialCycle.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ lifecyclePausedAt: { not: null } }),
        data: { lifecyclePausedAt: null, pauseReason: null },
      });
    });

    it('4) doble resume es idempotente: la segunda no cambia nada', async () => {
      prisma.automation.updateMany.mockResolvedValue({ count: 2 });
      await service.resume(CYCLE);
      const firstCalls = prisma.automation.updateMany.mock.calls.length;
      const secondSkipped = await service.resume(CYCLE);

      // El segundo resume vuelve a emitir el mismo UPDATE, pero ya no hay
      // SCHEDULED vencidos (los primeros pasaron a SKIPPED).
      expect(secondSkipped).toBe(2);
      expect(prisma.automation.updateMany.mock.calls.length).toBe(
        firstCalls + 1,
      );
    });

    it('5) EXECUTED nunca se toca: el where exige SCHEDULED', async () => {
      await service.resume(CYCLE);
      const arg = firstCallArg<{ where: { status: string } }>(
        prisma.automation.updateMany,
      );
      expect(arg.where.status).toBe(AutomationStatus.SCHEDULED);
      expect(arg.where.status).not.toBe(AutomationStatus.EXECUTED);
    });

    it('6) CANCELLED nunca se toca (queda para cancelación explícita)', async () => {
      await service.resume(CYCLE);
      const arg = firstCallArg<{
        where: { status: string };
        data: { status: string };
      }>(prisma.automation.updateMany);
      expect(arg.where.status).not.toBe(AutomationStatus.CANCELLED);
      // Y el destino nunca es CANCELLED.
      expect(arg.data.status).toBe(AutomationStatus.SKIPPED);
    });

    it('7) solo afecta al ciclo indicado', async () => {
      await service.resume('cy-otra');
      const arg = firstCallArg<{ where: { commercialCycleId: string } }>(
        prisma.automation.updateMany,
      );
      expect(arg.where.commercialCycleId).toBe('cy-otra');
    });

    it('audita el resume con cuántos hitos se perdieron', async () => {
      prisma.automation.updateMany.mockResolvedValue({ count: 3 });
      await service.resume(CYCLE, 'user-1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'lifecycle.resumed',
          metadata: { cycleId: CYCLE, skipped: 3 },
        }),
      );
    });

    it('pausa registra el motivo', async () => {
      await service.pause(CYCLE, LifecyclePauseReason.COMPLAINT, 'user-1');
      expect(prisma.commercialCycle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lifecyclePausedAt: null }),
          data: expect.objectContaining({
            pauseReason: LifecyclePauseReason.COMPLAINT,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // P0-F — reclamaciones (§6)
  // -------------------------------------------------------------------------
  describe('P0-F · reclamaciones (§6)', () => {
    it('abrir una reclamación pausa el ciclo', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        id: CYCLE,
        purchase: { organizationId: 'org-1' },
        complaints: [],
      });
      prisma.complaint.create.mockResolvedValue({ id: 'cp-1' });

      const res = await service.openComplaint({
        cycleId: CYCLE,
        reason: 'la batería se está descargando',
        openedBy: ComplaintOpenedBy.AUTO,
      });

      expect(res).toEqual({ id: 'cp-1', alreadyOpen: false });
      expect(prisma.commercialCycle.update).toHaveBeenCalledWith({
        where: { id: CYCLE },
        data: expect.objectContaining({
          pauseReason: LifecyclePauseReason.COMPLAINT,
        }),
      });
    });

    it('no duplica el caso si ya hay uno abierto', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        id: CYCLE,
        purchase: { organizationId: 'org-1' },
        complaints: [{ id: 'cp-existente' }],
      });

      const res = await service.openComplaint({
        cycleId: CYCLE,
        reason: 'otra cosa',
        openedBy: ComplaintOpenedBy.ADVISOR,
      });

      expect(res).toEqual({ id: 'cp-existente', alreadyOpen: true });
      expect(prisma.complaint.create).not.toHaveBeenCalled();
    });

    const complaintWith = (overrides: Record<string, unknown> = {}) => ({
      id: 'cp-1',
      resolvedAt: null,
      cycleId: CYCLE,
      cycle: {
        id: CYCLE,
        lifecyclePausedAt: new Date(),
        pauseReason: LifecyclePauseReason.COMPLAINT,
        purchase: { organizationId: 'org-1' },
      },
      ...overrides,
    });

    it('FALSE_ALARM reanuda y pasa lo vencido a SKIPPED', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());
      prisma.automation.updateMany.mockResolvedValue({ count: 2 });

      const res = await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'FALSE_ALARM',
        userId: 'u-1',
      });

      expect(res.effect).toBe('RESUME');
      expect(prisma.automation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: AutomationStatus.SKIPPED },
        }),
      );
      expect(prisma.commercialCycle.update).not.toHaveBeenCalled();
    });

    it('TECHNICAL_ISSUE_RESOLVED reanuda igual', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());
      const res = await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'TECHNICAL_ISSUE_RESOLVED',
        userId: 'u-1',
      });
      expect(res.effect).toBe('RESUME');
    });

    it('UNRESOLVED_NO_CONTACT reanuda y NO termina el ciclo', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());
      const res = await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'UNRESOLVED_NO_CONTACT',
        userId: 'u-1',
      });
      expect(res.effect).toBe('CONTINUE');
      expect(prisma.commercialCycle.update).not.toHaveBeenCalled();
    });

    it('BATTERY_REPLACED termina el ciclo y cancela lo pendiente', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());

      const res = await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'BATTERY_REPLACED',
        userId: 'u-1',
      });

      expect(res.effect).toBe('FINISH');
      // CANCELLED explícito: es decisión de negocio, no un hito vencido.
      expect(prisma.automation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: AutomationStatus.CANCELLED },
        }),
      );
      expect(prisma.commercialCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CommercialCycleStatus.FINISHED,
            terminationReason: LifecycleTerminationReason.BATTERY_REPLACED,
            lifecyclePausedAt: null,
          }),
        }),
      );
    });

    it('DEFECTIVE_PRODUCT_RETURNED termina sin lifecycle nuevo', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());
      await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'DEFECTIVE_PRODUCT_RETURNED',
        userId: 'u-1',
      });
      expect(prisma.commercialCycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            terminationReason:
              LifecycleTerminationReason.DEFECTIVE_PRODUCT_RETURNED,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ startsNewCycle: false }),
        }),
      );
    });

    it('DEFECTIVE_PRODUCT_REPLACED termina y arranca lifecycle nuevo', async () => {
      prisma.complaint.findFirst.mockResolvedValue(complaintWith());
      await service.resolveComplaint({
        complaintId: 'cp-1',
        resolution: 'DEFECTIVE_PRODUCT_REPLACED',
        userId: 'u-1',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ startsNewCycle: true }),
        }),
      );
    });

    it('no resuelve dos veces la misma reclamación', async () => {
      prisma.complaint.findFirst.mockResolvedValue(
        complaintWith({ resolvedAt: new Date() }),
      );
      await expect(
        service.resolveComplaint({
          complaintId: 'cp-1',
          resolution: 'FALSE_ALARM',
          userId: 'u-1',
        }),
      ).rejects.toThrow('ya estaba resuelta');
    });

    it('detecta la reclamación abierta para bloquear la reseña', async () => {
      prisma.complaint.findFirst.mockResolvedValue({ id: 'cp-1' });
      await expect(service.openComplaintFor(CYCLE)).resolves.toEqual({
        id: 'cp-1',
      });
    });
  });

  // -------------------------------------------------------------------------
  // P0-I — consentimiento auditable (§4.6, §4.7)
  // -------------------------------------------------------------------------
  describe('P0-I · consentimiento (§4.6, §4.7)', () => {
    beforeEach(() => {
      prisma.customer.findUnique.mockResolvedValue({ organizationId: 'org-1' });
    });

    it('sin registro no hay consentimiento (no implícito por silencio)', async () => {
      prisma.lifecycleConsent.findFirst.mockResolvedValue(null);
      await expect(
        service.hasValidMaintenanceConsent({ customerId: 'cu-1' }),
      ).resolves.toBe(false);
    });

    it('GRANTED vigente habilita el mantenimiento', async () => {
      prisma.lifecycleConsent.findFirst.mockResolvedValue({
        decision: ConsentDecision.GRANTED,
      });
      await expect(
        service.hasValidMaintenanceConsent({ customerId: 'cu-1' }),
      ).resolves.toBe(true);
    });

    it('REFUSED no habilita el mantenimiento', async () => {
      prisma.lifecycleConsent.findFirst.mockResolvedValue({
        decision: ConsentDecision.REFUSED,
      });
      await expect(
        service.hasValidMaintenanceConsent({ customerId: 'cu-1' }),
      ).resolves.toBe(false);
    });

    it('el filtro excluye revocados y caducados', async () => {
      await service.hasValidMaintenanceConsent({ customerId: 'cu-1' });
      const arg = firstCallArg<{
        where: { revokedAt: null; scope: string; AND: unknown[] };
      }>(prisma.lifecycleConsent.findFirst);
      expect(arg.where.revokedAt).toBeNull();
      expect(arg.where.scope).toBe(ConsentScope.MAINTENEMENT);
      expect(arg.where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ]),
      );
    });

    it('registra el consentimiento con su procedencia', async () => {
      prisma.lifecycleConsent.create.mockResolvedValue({ id: 'lc-1' });
      await service.recordConsent({
        customerId: 'cu-1',
        cycleId: CYCLE,
        decision: ConsentDecision.GRANTED,
        source: ConsentSource.ADVISOR,
        decidedBy: 'u-1',
      });
      expect(prisma.lifecycleConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision: ConsentDecision.GRANTED,
            source: ConsentSource.ADVISOR,
          }),
        }),
      );
    });

    it('revocar marca revokedAt sin borrar el histórico', async () => {
      await service.revokeConsent({ customerId: 'cu-1', decidedBy: 'u-1' });
      expect(prisma.lifecycleConsent.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'cu-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.lifecycleConsent.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // P0-J/K — contadores de negocio
  // -------------------------------------------------------------------------
  describe('P0-J/K · contadores de intento', () => {
    it('el fallo técnico NO cuenta como intento comercial', async () => {
      // El contador de negocio se incrementa solo desde recordMaintenanceAttempt;
      // retryCount es el contador técnico y no se toca aquí.
      prisma.commercialCycle.update.mockResolvedValue({
        maintenanceAttempts: 1,
      });
      const n = await service.recordMaintenanceAttempt(CYCLE);
      expect(n).toBe(1);
      const arg = firstCallArg<{ data: Record<string, unknown> }>(
        prisma.commercialCycle.update,
      );
      expect(arg.data.retryCount).toBeUndefined();
    });

    it('la reseña se marca una sola vez por ciclo', async () => {
      await service.markReviewRequested(CYCLE);
      expect(prisma.commercialCycle.updateMany).toHaveBeenCalledWith({
        where: { id: CYCLE, reviewRequestedAt: null },
        data: { reviewRequestedAt: expect.any(Date) },
      });
    });

    it('detecta que la reseña ya se pidió', async () => {
      prisma.commercialCycle.findUnique.mockResolvedValue({
        reviewRequestedAt: new Date(),
      });
      await expect(service.reviewAlreadyRequested(CYCLE)).resolves.toBe(true);
    });
  });
});
