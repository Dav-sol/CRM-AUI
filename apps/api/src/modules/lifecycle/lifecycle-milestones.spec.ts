import { addMonthsClamped, warrantyEnd } from './lifecycle.rules';
import {
  elapsedMilestones,
  planMilestones,
  REVIEW_INTERVAL_MONTHS,
} from './lifecycle-milestones';

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe('planMilestones · etapas que el PIT define', () => {
  const purchase = civil('2026-01-15');

  it('sin fecha de compra no hay ciclo ni hitos', () => {
    expect(planMilestones({ purchaseDate: null, warrantyMonths: 12 })).toEqual(
      [],
    );
  });

  it('sin garantía definida no hay hitos (no se inventa fecha)', () => {
    expect(
      planMilestones({ purchaseDate: purchase, warrantyMonths: null }),
    ).toEqual([]);
    expect(
      planMilestones({ purchaseDate: purchase, warrantyMonths: 0 }),
    ).toEqual([]);
  });

  // RF-03: revisiones en los meses 2, 4, 6, 8…
  it('RF-03 · programa revisiones en los meses 2, 4, 6, 8, 10 y 12', () => {
    const reviews = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    })
      .filter((m) => m.kind === 'REVIEW_BIMONTHLY')
      .map((m) => ymd(m.scheduledDate));

    expect(reviews).toEqual([
      '2026-03-15', // +2m
      '2026-05-15', // +4m
      '2026-07-15', // +6m
      '2026-09-15', // +8m
      '2026-11-15', // +10m
      '2027-01-15', // +12m
    ]);
    expect(reviews).toHaveLength(12 / REVIEW_INTERVAL_MONTHS);
  });

  it.each([
    [12, 6],
    [15, 7],
    [18, 9],
    [24, 12],
  ])('para %i meses genera %i revisiones', (months, expected) => {
    const reviews = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: months,
    }).filter((m) => m.kind === 'REVIEW_BIMONTHLY');
    expect(reviews).toHaveLength(expected);
  });

  it('RF-03 · ninguna revisión cae fuera de la garantía', () => {
    const expiry = warrantyEnd(purchase, 15)!;
    const reviews = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 15,
    }).filter((m) => m.kind === 'REVIEW_BIMONTHLY');
    for (const review of reviews) {
      expect(review.scheduledDate.getTime()).toBeLessThanOrEqual(
        expiry.getTime(),
      );
    }
  });

  it('RF-03 · las revisiones usan meses de calendario con clamp (P1.8)', () => {
    // Compra el 31 de enero: la revisión de +2m cae en marzo, no el 3 de marzo.
    const reviews = planMilestones({
      purchaseDate: civil('2026-01-31'),
      warrantyMonths: 12,
    }).filter((m) => m.kind === 'REVIEW_BIMONTHLY');
    expect(ymd(reviews[0].scheduledDate)).toBe('2026-03-31');
  });

  // RF-07
  it('RF-07 · preaviso 30 días antes del vencimiento', () => {
    const pre = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    }).find((m) => m.kind === 'PRE_EXPIRY');
    expect(pre).toBeDefined();
    expect(ymd(pre!.scheduledDate)).toBe('2026-12-16');
    expect(pre!.offsetLabel).toBe('-30d');
  });

  // RF-06
  it('RF-06 · los cinco impactos se miden desde el vencimiento ORIGINAL', () => {
    const retention = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    }).filter((m) => m.kind.startsWith('RETENTION_'));

    expect(retention.map((m) => m.offsetLabel)).toEqual([
      '+60d',
      '+90d',
      '+6m',
      '+12m',
      '+18m',
    ]);
    expect(retention.map((m) => ymd(m.scheduledDate))).toEqual([
      '2027-03-16', // +60d desde 2027-01-15
      '2027-04-15', // +90d
      '2027-07-15', // +6m
      '2028-01-15', // +12m
      '2028-07-15', // +18m
    ]);
  });

  it('RF-06 · el último impacto NO se mide desde el anterior', () => {
    const retention = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    }).filter((m) => m.kind.startsWith('RETENTION_'));
    const expiry = warrantyEnd(purchase, 12)!;
    // +18m desde el vencimiento original, no encadenado desde +12m.
    expect(retention.at(-1)!.scheduledDate.getTime()).toBe(
      addMonthsClamped(expiry, 18).getTime(),
    );
  });

  // Decisión aprobada: los plazos heredados de spec-025 quedan fuera.
  it('no genera los plazos heredados de spec-025 (+3d, +60d, +67d, +12m)', () => {
    const dates = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    }).map((m) => ymd(m.scheduledDate));
    const purchaseTs = purchase.getTime();
    const day = 86_400_000;

    expect(dates).not.toContain('2026-01-18'); // +3d
    // +60d y +67d sobre la COMPRA no se generan: ese mantenimiento venía de
    // `spec-025`. El +60d que sí existe es un impacto de RETENCIÓN y cae en
    // 2027-03-16, más de un año después.
    expect(dates).not.toContain('2026-03-16');
    expect(dates).not.toContain('2026-03-23');
    expect(dates).toContain('2027-03-16');
    // +6m/+12m solo existen como impactos de RETENCIÓN desde el vencimiento.
    const preExpiryAndReviews = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    }).filter((m) => m.kind === 'REVIEW_BIMONTHLY' || m.kind === 'PRE_EXPIRY');
    for (const m of preExpiryAndReviews) {
      expect(m.scheduledDate.getTime()).toBeLessThan(purchaseTs + 400 * day);
    }
  });

  it('ordena los hitos por fecha', () => {
    const planned = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    });
    for (let i = 1; i < planned.length; i++) {
      expect(planned[i].scheduledDate.getTime()).toBeGreaterThanOrEqual(
        planned[i - 1].scheduledDate.getTime(),
      );
    }
  });

  it('es idempotente: dos llamadas producen el mismo plan', () => {
    const a = planMilestones({ purchaseDate: purchase, warrantyMonths: 12 });
    const b = planMilestones({ purchaseDate: purchase, warrantyMonths: 12 });
    expect(b).toEqual(a);
    // Y no hay hitos duplicados por fecha.
    expect(new Set(a.map((m) => ymd(m.scheduledDate))).size).toBe(a.length);
  });

  it('es independiente de la zona horaria del proceso', () => {
    const plan = planMilestones({ purchaseDate: purchase, warrantyMonths: 12 });
    expect(plan.map((m) => ymd(m.scheduledDate))).toEqual([
      '2026-03-15',
      '2026-05-15',
      '2026-07-15',
      '2026-09-15',
      '2026-11-15',
      '2026-12-16',
      '2027-01-15',
      '2027-03-16',
      '2027-04-15',
      '2027-07-15',
      '2028-01-15',
      '2028-07-15',
    ]);
  });
});

describe('elapsedMilestones', () => {
  const purchase = civil('2026-01-15');

  it('devuelve solo los hitos ya vencidos', () => {
    const planned = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    });
    const elapsed = elapsedMilestones(planned, civil('2026-07-16'));

    expect(elapsed.length).toBeGreaterThan(0);
    for (const m of elapsed) {
      expect(m.scheduledDate.getTime()).toBeLessThanOrEqual(
        civil('2026-07-16').getTime(),
      );
    }
    // Las revisiones +2m, +4m y +6m ya vencieron; la de +8m todavía no.
    expect(elapsed.map((m) => m.offsetLabel)).toContain('+2m');
    expect(elapsed.map((m) => m.offsetLabel)).toContain('+6m');
    expect(elapsed.map((m) => m.offsetLabel)).not.toContain('+8m');
  });

  it('no genera hitos retroactivos tras una compra tardía', () => {
    const planned = planMilestones({
      purchaseDate: purchase,
      warrantyMonths: 12,
    });
    const at = civil('2026-06-01');
    // Todo lo anterior queda marcado como vencido, no se reprograma.
    expect(
      elapsedMilestones(planned, at).every((m) => m.scheduledDate <= at),
    ).toBe(true);
  });
});
