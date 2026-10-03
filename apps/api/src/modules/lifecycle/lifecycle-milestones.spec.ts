import { warrantyEnd } from './lifecycle.rules';
import {
  elapsedMilestones,
  planMilestones,
  type MilestonePlanInput,
} from './lifecycle-milestones';

const INSTALL = new Date('2026-01-15T12:00:00.000Z');
const DAY = 86_400_000;
const days = (n: number) => new Date(INSTALL.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / DAY);

const input = (over: Partial<MilestonePlanInput> = {}) => ({
  installationDate: INSTALL,
  warrantyMonths: 12,
  reviewOffsetDays: 2,
  ...over,
});

describe('planMilestones (spec 025 §3)', () => {
  it('sin instalación NO planifica nada (gate G8, §1)', () => {
    const plan = planMilestones(input({ installationDate: null }));
    expect(plan).toEqual([]);
  });

  it('la reseña se sitúa dentro de la ventana 2..5', () => {
    for (const offset of [2, 3, 4, 5]) {
      const plan = planMilestones(input({ reviewOffsetDays: offset }));
      const review = plan.find((m) => m.kind === 'REVIEW');
      expect(review).toBeDefined();
      expect(diffDays(review!.scheduledDate, INSTALL)).toBe(offset);
    }
  });

  it('una reseña fuera de la ventana no se planifica', () => {
    for (const offset of [1, 6, 0]) {
      expect(
        planMilestones(input({ reviewOffsetDays: offset })).find(
          (m) => m.kind === 'REVIEW',
        ),
      ).toBeUndefined();
    }
  });

  it('mantenimiento: primer intento a +60, solo con consentimiento', () => {
    const plan = planMilestones(input());
    const m1 = plan.find((x) => x.kind === 'MAINTENANCE_1ST')!;
    expect(diffDays(m1.scheduledDate, INSTALL)).toBe(60);
    expect(m1.requiresMaintenanceConsent).toBe(true);
    expect(m1.category).toBe('MAINTENANCE_CONSENTED');
  });

  it('mantenimiento: segundo intento exactamente +7 días del primero', () => {
    const plan = planMilestones(input({ maintenanceAttemptsMade: 1 }));
    const m1 = plan.find((x) => x.kind === 'MAINTENANCE_1ST');
    const m2 = plan.find((x) => x.kind === 'MAINTENANCE_2ND')!;
    expect(m1).toBeUndefined();
    expect(diffDays(m2.scheduledDate, INSTALL)).toBe(67);
    expect(m2.requiresMaintenanceConsent).toBe(true);
  });

  it('tras el segundo intento NO hay más recordatorios', () => {
    const plan = planMilestones(input({ maintenanceAttemptsMade: 2 }));
    expect(plan.filter((m) => m.kind.startsWith('MAINTENANCE'))).toHaveLength(
      0,
    );
    // Pero el resto del lifecycle sigue intacto.
    expect(plan.find((m) => m.kind === 'PRE_EXPIRY')).toBeDefined();
    expect(plan.find((m) => m.kind === 'POST_EXPIRY_60')).toBeDefined();
  });

  it('pre-vencimiento a -30 del fin de garantía (§9)', () => {
    const plan = planMilestones(input());
    const pre = plan.find((m) => m.kind === 'PRE_EXPIRY')!;
    expect(diffDays(warrantyEnd(INSTALL, 12)!, pre.scheduledDate)).toBe(30);
    expect(pre.category).toBe('WARRANTY_EXPIRY');
    // No depende del consentimiento de mantenimiento.
    expect(pre.requiresMaintenanceConsent).toBe(false);
  });

  it('+60 y +90 tras el vencimiento (§13, §14)', () => {
    const end = warrantyEnd(INSTALL, 12)!;
    const plan = planMilestones(input());
    expect(
      diffDays(
        plan.find((m) => m.kind === 'POST_EXPIRY_60')!.scheduledDate,
        end,
      ),
    ).toBe(60);
    expect(
      diffDays(
        plan.find((m) => m.kind === 'POST_EXPIRY_90')!.scheduledDate,
        end,
      ),
    ).toBe(90);
  });

  it('el +90 se planifica igual aunque se haya ignorado el +60', () => {
    // No hay estado que registre "ignoró": §14 lo envía de todos modos.
    const plan = planMilestones(input());
    expect(plan.find((m) => m.kind === 'POST_EXPIRY_90')).toBeDefined();
  });

  it('las 4 duraciones de garantía producen hitos distintos', () => {
    const previews = ([12, 15, 18, 24] as const).map((months) => {
      const plan = planMilestones(input({ warrantyMonths: months }));
      return diffDays(
        plan.find((m) => m.kind === 'PRE_EXPIRY')!.scheduledDate,
        INSTALL,
      );
    });
    expect(new Set(previews).size).toBe(4);
  });

  it('sin garantía no hay hitos de vencimiento, pero sí reseña y mantenimiento', () => {
    const plan = planMilestones(input({ warrantyMonths: null }));
    expect(plan.find((m) => m.kind === 'PRE_EXPIRY')).toBeUndefined();
    expect(plan.find((m) => m.kind === 'POST_EXPIRY_60')).toBeUndefined();
    expect(plan.find((m) => m.kind === 'REVIEW')).toBeDefined();
    expect(plan.find((m) => m.kind === 'MAINTENANCE_1ST')).toBeDefined();
  });

  it('devuelve los hitos ordenados por fecha', () => {
    const plan = planMilestones(input());
    const dates = plan.map((m) => m.scheduledDate.getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it('no inventa el 2º contacto pre-vencimiento (PD-1 pendiente)', () => {
    const plan = planMilestones(input());
    // Solo un hito de vencimiento previo al propio vencimiento.
    const pre = plan.filter((m) => m.scheduledDate < warrantyEnd(INSTALL, 12)!);
    expect(pre.map((m) => m.kind)).toEqual([
      'REVIEW',
      'MAINTENANCE_1ST',
      'PRE_EXPIRY',
    ]);
  });

  it('no inventa hitos posteriores al +90 (PD-8 pendiente)', () => {
    const plan = planMilestones(input());
    const last = plan[plan.length - 1];
    expect(last.kind).toBe('POST_EXPIRY_90');
    expect(last.scheduledDate).toEqual(
      days(diffDays(last.scheduledDate, INSTALL)),
    );
  });
});

describe('elapsedMilestones (§4.5)', () => {
  it('detecta los hitos ya vencidos en el instante dado', () => {
    const plan = planMilestones(input());
    // A +70 han vencido reseña y 1er mantenimiento, pero el pre-vencimiento
    // está a +335 (garantía de 12 meses menos 30 días).
    const elapsed = elapsedMilestones(plan, days(70));
    expect(elapsed.map((m) => m.kind)).toEqual(['REVIEW', 'MAINTENANCE_1ST']);
    expect(elapsedMilestones(plan, days(336)).map((m) => m.kind)).toEqual([
      'REVIEW',
      'MAINTENANCE_1ST',
      'PRE_EXPIRY',
    ]);
  });

  it('una instalación tardía marca todo lo anterior como vencido', () => {
    const plan = planMilestones(input());
    const elapsed = elapsedMilestones(plan, days(1000));
    expect(elapsed).toHaveLength(plan.length);
  });

  it('una instalación recién hecha no tiene hitos vencidos', () => {
    const plan = planMilestones(input());
    expect(elapsedMilestones(plan, INSTALL)).toHaveLength(0);
  });
});
