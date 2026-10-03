import { Injectable } from '@nestjs/common';
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
import {
  RESOLUTION_EFFECTS,
  resolutionStartsNewCycle,
  type ComplaintResolutionValue,
} from './lifecycle.rules';

const MODULE = 'lifecycle';

/**
 * Servicio del lifecycle de postventa (spec 025).
 *
 * Deliberadamente NO genera automatizaciones ni envía mensajes: esas decisiones
 * viven en las capas 3 (Scheduling) y 5 (Execution). Aquí vive lo que es
 * estado del ciclo — pausa, reanudación sin retroactividad, reclamaciones,
 * consentimiento y transiciones por resolución.
 */
@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditIdentityService,
  ) {}

  // ---------------------------------------------------------------------------
  // P0-A — entrada al lifecycle (§1, gate G8)
  // ---------------------------------------------------------------------------

  /**
   * ¿Tiene esta compra una instalación válida? Sin ella NO hay lifecycle
   * (§1): la venta queda fuera y no se comunican hitos.
   */
  async tieneInstalacionValida(purchaseId: string): Promise<boolean> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { installationDate: true, deletedAt: true },
    });
    return Boolean(
      purchase && !purchase.deletedAt && purchase.installationDate,
    );
  }

  /**
   * Fecha base del ciclo: la instalación. Si no hay instalación devuelve null
   * y el ciclo queda fuera del lifecycle. No sustituye por la fecha de venta
   * ni inventa fechas (§1).
   */
  async baseDateOf(
    purchaseId: string,
  ): Promise<{ installationDate: Date; warrantyMonths: number | null } | null> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        installationDate: true,
        warrantyMonths: true,
        deletedAt: true,
      },
    });
    if (!purchase || purchase.deletedAt || !purchase.installationDate) {
      return null;
    }
    return {
      installationDate: purchase.installationDate,
      warrantyMonths: purchase.warrantyMonths ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // P0-G — pausa, reanudación y SKIPPED (§4, §4.5)
  // ---------------------------------------------------------------------------

  /** §4 G1: pausa el ciclo. Motivo obligatorio para poder auditarlo (§10). */
  async pause(
    cycleId: string,
    reason: LifecyclePauseReason,
    userId: string | null = null,
  ): Promise<void> {
    await this.prisma.commercialCycle.updateMany({
      where: { id: cycleId, lifecyclePausedAt: null, deletedAt: null },
      data: { lifecyclePausedAt: new Date(), pauseReason: reason },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'lifecycle.paused',
      outcome: 'success',
      userId,
      organizationId: await this.orgOf(cycleId),
      description: 'lifecycle paused',
      metadata: { cycleId, reason },
    });
  }

  /**
   * §4.5 — reanudar sin retroactividad.
   *
   * Toda automatización del ciclo que esté SCHEDULED y con hito YA VENCIDO
   * pasa a SKIPPED: su hito quedó obsoleto por el tiempo en pausa y no es
   * ejecutable. Las futuras no se tocan, las EXECUTED/CANCELLED tampoco, y no
   * se genera ningún mensaje sustitutivo para compensar el perdido.
   *
   * Idempotente: reanudar dos veces no produce efectos adicionales.
   */
  async resume(cycleId: string, userId: string | null = null): Promise<number> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.automation.updateMany({
        where: {
          commercialCycleId: cycleId,
          status: AutomationStatus.SCHEDULED,
          scheduledDate: { lte: now },
          deletedAt: null,
        },
        data: { status: AutomationStatus.SKIPPED },
      });

      await tx.commercialCycle.updateMany({
        where: {
          id: cycleId,
          lifecyclePausedAt: { not: null },
          deletedAt: null,
        },
        data: { lifecyclePausedAt: null, pauseReason: null },
      });

      await this.auditService.record({
        module: MODULE,
        action: 'lifecycle.resumed',
        outcome: 'success',
        userId,
        organizationId: await this.orgOf(cycleId),
        description: 'lifecycle resumed',
        metadata: { cycleId, skipped: count },
      });
      return count;
    });
  }

  /** ¿El ciclo está pausado? (gate G1) */
  async isPaused(cycleId: string): Promise<boolean> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: cycleId },
      select: { lifecyclePausedAt: true },
    });
    return Boolean(cycle?.lifecyclePausedAt);
  }

  // ---------------------------------------------------------------------------
  // P0-F — reclamaciones (§6)
  // ---------------------------------------------------------------------------

  /**
   * Abre una reclamación y pausa el ciclo (§6). Un ciclo no puede tener dos
   * reclamaciones abiertas a la vez: si ya hay una, se devuelve la existente
   * en lugar de duplicar el caso.
   */
  async openComplaint(params: {
    cycleId: string;
    reason: string;
    openedBy: ComplaintOpenedBy;
    conversationId?: string | null;
    userId?: string | null;
  }): Promise<{ id: string; alreadyOpen: boolean }> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: params.cycleId },
      select: {
        id: true,
        purchase: { select: { organizationId: true } },
        complaints: {
          where: { resolvedAt: null, deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!cycle) {
      throw new Error('lifecycle no encontrado');
    }
    const open = cycle.complaints[0];
    if (open) {
      return { id: open.id, alreadyOpen: true };
    }

    const complaint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.complaint.create({
        data: {
          organizationId: cycle.purchase.organizationId,
          cycleId: cycle.id,
          conversationId: params.conversationId ?? null,
          openedReason: params.reason,
          openedBy: params.openedBy,
          detectedBy: params.openedBy,
          createdBy: params.userId ?? null,
        },
      });
      await tx.commercialCycle.update({
        where: { id: cycle.id },
        data: {
          lifecyclePausedAt: new Date(),
          pauseReason: LifecyclePauseReason.COMPLAINT,
          updatedBy: params.userId ?? null,
        },
      });
      return created;
    });

    await this.auditService.record({
      module: MODULE,
      action: 'complaint.opened',
      outcome: 'success',
      userId: params.userId ?? null,
      organizationId: cycle.purchase.organizationId,
      description: 'complaint opened',
      metadata: {
        complaintId: complaint.id,
        cycleId: cycle.id,
        detectedBy: params.openedBy,
      },
    });

    return { id: complaint.id, alreadyOpen: false };
  }

  /**
   * Resuelve una reclamación y aplica la transición de su outcome (§6.1).
   * Cada outcome tiene un único efecto; aquí no se decide nada nuevo.
   */
  async resolveComplaint(params: {
    complaintId: string;
    resolution: ComplaintResolutionValue;
    notes?: string | null;
    userId: string;
  }): Promise<{ effect: string; skipped: number }> {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id: params.complaintId, deletedAt: null },
      include: {
        cycle: {
          select: {
            id: true,
            lifecyclePausedAt: true,
            pauseReason: true,
            purchase: { select: { organizationId: true } },
          },
        },
      },
    });
    if (!complaint) {
      throw new Error('reclamación no encontrada');
    }
    if (complaint.resolvedAt) {
      throw new Error('la reclamación ya estaba resuelta');
    }

    const effect = RESOLUTION_EFFECTS[params.resolution];

    const now = new Date();
    await this.prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        resolvedAt: now,
        resolution: params.resolution,
        resolutionNotes: params.notes ?? null,
        resolvedBy: params.userId,
        updatedBy: params.userId,
      },
    });

    let skipped = 0;
    if (effect.kind === 'FINISH') {
      // CANCELLED explícito: decisión de negocio, no un hito vencido (§4.5).
      await this.prisma.$transaction(async (tx) => {
        await tx.automation.updateMany({
          where: {
            commercialCycleId: complaint.cycleId,
            status: AutomationStatus.SCHEDULED,
            deletedAt: null,
          },
          data: { status: AutomationStatus.CANCELLED },
        });
        await tx.commercialCycle.update({
          where: { id: complaint.cycleId },
          data: {
            status: CommercialCycleStatus.FINISHED,
            endDate: now,
            terminatedAt: now,
            terminationReason:
              effect.terminationReason as LifecycleTerminationReason,
            lifecyclePausedAt: null,
            pauseReason: null,
            updatedBy: params.userId,
          },
        });
      });
    } else {
      // RESUME y CONTINUE reanudan: lo vencido pasa a SKIPPED (§4.5).
      skipped = await this.resume(complaint.cycleId, params.userId);
    }

    await this.auditService.record({
      module: MODULE,
      action: 'complaint.resolved',
      outcome: 'success',
      userId: params.userId,
      organizationId: complaint.cycle.purchase.organizationId,
      description: 'complaint resolved',
      metadata: {
        complaintId: complaint.id,
        cycleId: complaint.cycleId,
        resolution: params.resolution,
        effect: effect.kind,
        startsNewCycle: resolutionStartsNewCycle(params.resolution),
        skipped,
      },
    });

    return { effect: effect.kind, skipped };
  }

  /** Reclamación abierta de un ciclo, si la hay (§3: bloquea la reseña). */
  async openComplaintFor(cycleId: string): Promise<{ id: string } | null> {
    const complaint = await this.prisma.complaint.findFirst({
      where: { cycleId, resolvedAt: null, deletedAt: null },
      select: { id: true },
    });
    return complaint;
  }

  // ---------------------------------------------------------------------------
  // P0-I — consentimiento auditable (§4.6)
  // ---------------------------------------------------------------------------

  /**
   * Registra una decisión de consentimiento. La ausencia de registro equivale
   * a "no consentido": no hay consentimiento implícito (§3.1).
   */
  async recordConsent(params: {
    customerId: string;
    cycleId?: string | null;
    decision: ConsentDecision;
    source: ConsentSource;
    decidedBy?: string | null;
    sourceMessageId?: string | null;
    scope?: ConsentScope;
  }): Promise<{ id: string }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: params.customerId },
      select: { organizationId: true },
    });
    if (!customer) {
      throw new Error('cliente no encontrado');
    }
    const created = await this.prisma.lifecycleConsent.create({
      data: {
        organizationId: customer.organizationId,
        customerId: params.customerId,
        cycleId: params.cycleId ?? null,
        scope: params.scope ?? ConsentScope.MAINTENEMENT,
        decision: params.decision,
        source: params.source,
        decidedBy: params.decidedBy ?? null,
        sourceMessageId: params.sourceMessageId ?? null,
      },
      select: { id: true },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'consent.recorded',
      outcome: 'success',
      userId: params.decidedBy ?? null,
      organizationId: customer.organizationId,
      description: 'consent recorded',
      metadata: {
        consentId: created.id,
        decision: params.decision,
        scope: params.scope ?? ConsentScope.MAINTENEMENT,
        source: params.source,
      },
    });
    return created;
  }

  /**
   * Gate G7 (§4.7): el mantenimiento solo se habilita con un GRANTED vigente.
   * Sin registro, revocado o caducado → no consentido. Rechazar NO termina el
   * lifecycle: solo bloquea los recordatorios de revisión.
   */
  async hasValidMaintenanceConsent(params: {
    customerId: string;
    cycleId?: string | null;
    at?: Date;
  }): Promise<boolean> {
    const at = params.at ?? new Date();
    const consent = await this.prisma.lifecycleConsent.findFirst({
      where: {
        customerId: params.customerId,
        scope: ConsentScope.MAINTENEMENT,
        revokedAt: null,
        ...(params.cycleId ? { cycleId: params.cycleId } : {}),
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
          { decidedAt: { lte: at } },
        ],
      },
      orderBy: { decidedAt: 'desc' },
      select: { decision: true },
    });
    return consent?.decision === ConsentDecision.GRANTED;
  }

  /** Revoca el consentimiento sin borrarlo: la trazabilidad es el requisito. */
  async revokeConsent(params: {
    customerId: string;
    decidedBy?: string | null;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.lifecycleConsent.updateMany({
      where: { customerId: params.customerId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.auditService.record({
      module: MODULE,
      action: 'consent.revoked',
      outcome: 'success',
      userId: params.decidedBy ?? null,
      description: 'consent revoked',
      metadata: { customerId: params.customerId },
    });
  }

  // ---------------------------------------------------------------------------
  // P0-J/K — contadores de intento de negocio
  // ---------------------------------------------------------------------------

  /**
   * Registra un intento COMERCIAL de mantenimiento. Los fallos técnicos de
   * envío no llegan aquí: usan retryCount (§3.1).
   */
  async recordMaintenanceAttempt(cycleId: string): Promise<number> {
    const cycle = await this.prisma.commercialCycle.update({
      where: { id: cycleId },
      data: { maintenanceAttempts: { increment: 1 } },
      select: { maintenanceAttempts: true },
    });
    return cycle.maintenanceAttempts;
  }

  /** §3: la reseña se pide una sola vez por ciclo. */
  async markReviewRequested(cycleId: string): Promise<void> {
    await this.prisma.commercialCycle.updateMany({
      where: { id: cycleId, reviewRequestedAt: null },
      data: { reviewRequestedAt: new Date() },
    });
  }

  async reviewAlreadyRequested(cycleId: string): Promise<boolean> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: cycleId },
      select: { reviewRequestedAt: true },
    });
    return Boolean(cycle?.reviewRequestedAt);
  }

  private async orgOf(cycleId: string): Promise<string | null> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: cycleId },
      select: { purchase: { select: { organizationId: true } } },
    });
    return cycle?.purchase.organizationId ?? null;
  }
}
