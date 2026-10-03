import { Injectable } from '@nestjs/common';
import { MessageDirection, MessageType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  automaticFrequencyBlocks,
  manualSilenceBlocks,
  winsCollision,
  type CommunicationCategory,
} from './lifecycle.rules';

/**
 * ÚNICO lugar donde viven las reglas transversales de envío (spec 025 §2, §4).
 *
 * Regla arquitectónica: una regla transversal existe aquí una sola vez. No se
 * duplica en campañas ni en generadores. `commercialAllowed` NO está aquí
 * porque es regla de GENERACIÓN (cuántas automatizaciones crear), no de envío.
 *
 * Los gates se evalúan en orden y el primero que bloquea manda. Los bloqueos
 * por ventana y horario son "espera a la próxima ventana"; los de pausa,
 * opt-out, frecuencia y silencio son "no enviar y no reprogramar" (§5).
 */
export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8';

export type GateDecision = {
  allowed: boolean;
  /** Primer gate que bloqueó, si hubo. */
  blockedBy?: GateId;
  /** Explicación apta para log/auditoría. */
  reason?: string;
  /** true = esperar a la próxima ventana; false = no enviar y no reprogramar. */
  deferrable: boolean;
};

const ALLOW: GateDecision = { allowed: true, deferrable: false };

/**
 * Ventanas de envío (spec 025 §4.4). Domingos y festivos no admiten envíos
 * programados. El lunes-viernes y el sábado tienen ventana propia.
 */
export type DayWindow = { startMinutes: number; endMinutes: number };

export const DEFAULT_WEEKLY_WINDOWS: Record<number, DayWindow | null> = {
  0: null, // domingo
  1: { startMinutes: 8 * 60, endMinutes: 19 * 60 + 30 }, // 08:00-19:30
  2: { startMinutes: 8 * 60, endMinutes: 19 * 60 + 30 },
  3: { startMinutes: 8 * 60, endMinutes: 19 * 60 + 30 },
  4: { startMinutes: 8 * 60, endMinutes: 19 * 60 + 30 },
  5: { startMinutes: 8 * 60, endMinutes: 19 * 60 + 30 },
  6: { startMinutes: 8 * 60 + 30, endMinutes: 18 * 60 }, // 08:30-18:00
};

/**
 * Excepción explícita y delimitada (§4.4): un evento calculado para domingo a
 * las 02:00 se desplaza al lunes a las 12:15. 12:15 está dentro de la ventana
 * del lunes: es un valor deliberado, NO el resultado de un redondeo a la
 * siguiente ventana válida (que habría dado 08:00).
 *
 * Esta excepción NO define el comportamiento de otros eventos fuera de
 * ventana (sábado después de las 18:00, festivos entre semana): esos siguen
 * la lógica general de ventanas de arriba.
 */
export const SUNDAY_0200_EXCEPTION = {
  fromDayOfWeek: 0,
  fromMinutes: 2 * 60,
  toDayOfWeek: 1,
  toMinutes: 12 * 60 + 15,
} as const;

export function isSundayTwoAm(
  dayOfWeek: number,
  minutesOfDay: number,
): boolean {
  return (
    dayOfWeek === SUNDAY_0200_EXCEPTION.fromDayOfWeek &&
    minutesOfDay === SUNDAY_0200_EXCEPTION.fromMinutes
  );
}

export interface EligibilityInput {
  customerId: string;
  organizationId: string;
  /** Lifecycle asociado, si la automatización pertenece a uno. */
  cycleId?: string | null;
  /** Categoría de la comunicación, solo para desempate bajo G3 (§5). */
  category?: CommunicationCategory;
  /** Ventanas por día; por defecto las de la spec. */
  weeklyWindows?: Record<number, DayWindow | null>;
  /** Fechas festivas (YYYY-MM-DD). */
  holidays?: readonly string[];
  /** Instante de envío en la zona horaria de la organización. */
  now: Date;
  /** Zona horaria IANA para resolver el día y la hora locales. */
  timeZone?: string;
  /** ¿La automatización es de mantenimiento y exige consentimiento (G7)? */
  requiresMaintenanceConsent?: boolean;
  /**
   * Respuesta instantánea a una conversación abierta por el cliente (§4.4).
   * No es un envío programado: no consulta ventanas ni frecuencia, solo
   * respeta el opt-out global del cliente (§10).
   */
  instantReply?: boolean;
}

@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evalúa todos los gates en orden. Devuelve el primer bloqueo.
   */
  async evaluate(input: EligibilityInput): Promise<GateDecision> {
    // G2 primero: el opt-out es global del cliente y lo más restrictivo.
    const g2 = await this.checkOptOut(input.customerId);
    if (!g2.allowed) return g2;

    // G8: sin instalación válida no hay lifecycle que comunique (§1).
    if (input.cycleId) {
      const g8 = await this.checkInstallation(input.cycleId);
      if (!g8.allowed) return g8;

      // G1: lifecycle pausado (reclamación, atención humana, pausa manual).
      const g1 = await this.checkPause(input.cycleId);
      if (!g1.allowed) return g1;

      // G7: solo aplica a etapas de mantenimiento y NO es transversal (§4.3).
      if (input.requiresMaintenanceConsent) {
        const g7 = await this.checkMaintenanceConsent(
          input.customerId,
          input.cycleId,
          input.now,
        );
        if (!g7.allowed) return g7;
      }
    }

    // Una respuesta instantánea solo atraviesa el opt-out (§4.4).
    if (input.instantReply) return ALLOW;

    const local = this.localParts(input.now, input.timeZone);
    const windows = input.weeklyWindows ?? DEFAULT_WEEKLY_WINDOWS;

    // Excepción delimitada del domingo 02:00 (§4.4). Se evalúa ANTES de las
    // ventanas porque su destino (lunes 12:15) está dentro de la ventana.
    if (isSundayTwoAm(local.dayOfWeek, local.minutesOfDay)) {
      const monday = windows[SUNDAY_0200_EXCEPTION.toDayOfWeek];
      if (
        monday &&
        local.minutesOfDay >= SUNDAY_0200_EXCEPTION.toMinutes &&
        local.minutesOfDay <= monday.endMinutes
      ) {
        // Ya estamos en la franja de la excepción: se permite.
      } else {
        return {
          allowed: false,
          blockedBy: 'G5',
          reason: 'domingo 02:00 se desplaza a lunes 12:15',
          deferrable: true,
        };
      }
    }

    // G6: festivo.
    if ((input.holidays ?? []).includes(local.isoDate)) {
      return {
        allowed: false,
        blockedBy: 'G6',
        reason: `festivo ${local.isoDate}`,
        deferrable: true,
      };
    }

    // G5: ventana horaria del día. Sin ventana (domingo) no se envía nada.
    const window = windows[local.dayOfWeek];
    if (!window) {
      return {
        allowed: false,
        blockedBy: 'G5',
        reason: 'día sin envíos programados',
        deferrable: true,
      };
    }
    if (
      local.minutesOfDay < window.startMinutes ||
      local.minutesOfDay > window.endMinutes
    ) {
      return {
        allowed: false,
        blockedBy: 'G5',
        reason: `fuera de ventana ${formatMinutes(window.startMinutes)}-${formatMinutes(window.endMinutes)}`,
        deferrable: true,
      };
    }

    // G4: 7 días de silencio tras el último MANUAL (§4.2).
    const g4 = await this.checkManualSilence(input.customerId, input.now);
    if (!g4.allowed) return g4;

    // G3: 1 outbound AUTOMATIC cada 15 días (§4.1).
    const g3 = await this.checkAutomaticFrequency(input.customerId, input.now);
    if (!g3.allowed) return g3;

    return ALLOW;
  }

  // ---------------------------------------------------------------------------
  // Gates individuales. Públicos para poder testearlos y para que el scheduler
  // pueda consultar G1/G8 sin reevaluar todo.
  // ---------------------------------------------------------------------------

  /** G2: opt-out global del cliente. La atención humana sí se permite (§10). */
  async checkOptOut(customerId: string): Promise<GateDecision> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { noContactAt: true },
    });
    if (customer?.noContactAt) {
      return {
        allowed: false,
        blockedBy: 'G2',
        reason: 'cliente con no-contact',
        deferrable: false,
      };
    }
    return ALLOW;
  }

  /** G8: el lifecycle requiere instalación válida (§1). */
  async checkInstallation(cycleId: string): Promise<GateDecision> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: cycleId },
      select: { purchase: { select: { installationDate: true } } },
    });
    if (!cycle?.purchase.installationDate) {
      return {
        allowed: false,
        blockedBy: 'G8',
        reason: 'sin instalación válida no hay lifecycle',
        deferrable: true,
      };
    }
    return ALLOW;
  }

  /** G1: lifecycle pausado. */
  async checkPause(cycleId: string): Promise<GateDecision> {
    const cycle = await this.prisma.commercialCycle.findUnique({
      where: { id: cycleId },
      select: { lifecyclePausedAt: true },
    });
    if (cycle?.lifecyclePausedAt) {
      return {
        allowed: false,
        blockedBy: 'G1',
        reason: 'lifecycle pausado',
        deferrable: false,
      };
    }
    return ALLOW;
  }

  /** G7: el mantenimiento solo se habilita con consentimiento vigente. */
  async checkMaintenanceConsent(
    customerId: string,
    cycleId: string,
    now: Date,
  ): Promise<GateDecision> {
    const consent = await this.prisma.lifecycleConsent.findFirst({
      where: {
        customerId,
        cycleId,
        scope: 'MAINTENEMENT',
        revokedAt: null,
        decidedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { decidedAt: 'desc' },
      select: { decision: true },
    });
    if (consent?.decision !== 'GRANTED') {
      return {
        allowed: false,
        blockedBy: 'G7',
        reason: 'sin consentimiento de mantenimiento vigente',
        deferrable: false,
      };
    }
    return ALLOW;
  }

  /**
   * G3: máximo 1 outbound AUTOMATIC por cliente cada 15 días.
   *
   * Se cuenta por `sentAt`, no `createdAt`: un mensaje en cola no es un envío.
   * MANUAL no entra: es outbound pero no automático (§4.2).
   */
  async checkAutomaticFrequency(
    customerId: string,
    now: Date,
  ): Promise<GateDecision> {
    const last = await this.prisma.message.findFirst({
      where: {
        customerId,
        type: MessageType.AUTOMATIC,
        direction: MessageDirection.OUTBOUND,
        sentAt: { not: null },
        deletedAt: null,
      },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    if (automaticFrequencyBlocks(last?.sentAt ?? null, now)) {
      return {
        allowed: false,
        blockedBy: 'G3',
        reason: 'un outbound automático ya se envió en los últimos 15 días',
        deferrable: false,
      };
    }
    return ALLOW;
  }

  /** G4: 7 días de silencio desde el último MANUAL. */
  async checkManualSilence(
    customerId: string,
    now: Date,
  ): Promise<GateDecision> {
    const last = await this.prisma.message.findFirst({
      where: {
        customerId,
        type: MessageType.MANUAL,
        direction: MessageDirection.OUTBOUND,
        sentAt: { not: null },
        deletedAt: null,
      },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    if (manualSilenceBlocks(last?.sentAt ?? null, now)) {
      return {
        allowed: false,
        blockedBy: 'G4',
        reason: 'asesor intervenió hace menos de 7 días',
        deferrable: false,
      };
    }
    return ALLOW;
  }

  /**
   * §5: desempate cuando G3 impide enviar más de una comunicación.
   * Devuelve true si la candidata gana. G3 no se modifica ni se salta.
   */
  resolveCollision(
    candidate: CommunicationCategory,
    incumbent: CommunicationCategory,
  ): boolean {
    return winsCollision(candidate, incumbent);
  }

  /**
   * Resuelve día y hora locales en la zona horaria de la organización.
   * `timeZone` no se usa para calcular el desfase a mano: se delega en Intl,
   * que ya sabe aplicar DST.
   */
  private localParts(
    at: Date,
    timeZone?: string,
  ): { dayOfWeek: number; minutesOfDay: number; isoDate: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const get = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? '';

    const dayOfWeek = WEEKDAY_INDEX[get('weekday')] ?? 0;
    const hour = Number(get('hour')) % 24; // Intl puede devolver "24" a medianoche
    const minute = Number(get('minute'));

    return {
      dayOfWeek,
      minutesOfDay: hour * 60 + minute,
      isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    };
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function formatMinutes(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
