import {
  addMonthsClamped,
  automaticFrequencyBlocks,
  diffInDays,
  isWithinReviewWindow,
  maintenanceFirstAttemptAt,
  maintenanceSecondAttemptAt,
  manualSilenceBlocks,
  nextMaintenanceAttempt,
  pickWinner,
  postExpiry60At,
  postExpiry90At,
  preExpiryAt,
  RESOLUTION_EFFECTS,
  COMPLAINT_RESOLUTIONS,
  resolutionStartsNewCycle,
  warrantyEnd,
  winsCollision,
  type ComplaintResolutionValue,
} from './lifecycle.rules';

const DAY = 86_400_000;
const base = new Date('2026-01-15T12:00:00.000Z');
const at = (days: number) => new Date(base.getTime() + days * DAY);

describe('addMonthsClamped (P1.8 · meses calendario)', () => {
  const at = (iso: string) => new Date(iso);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  it('31 de enero + 1 mes cae en 28 de febrero de un año común', () => {
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 1))).toBe(
      '2027-02-28',
    );
  });

  it('31 de enero + 1 mes cae en 29 de febrero de un año bisiesto', () => {
    expect(ymd(addMonthsClamped(at('2028-01-31T00:00:00Z'), 1))).toBe(
      '2028-02-29',
    );
  });

  it('30 de enero + 1 mes cae en 28 o 29 de febrero según el año', () => {
    expect(ymd(addMonthsClamped(at('2027-01-30T00:00:00Z'), 1))).toBe(
      '2027-02-28',
    );
    expect(ymd(addMonthsClamped(at('2028-01-30T00:00:00Z'), 1))).toBe(
      '2028-02-29',
    );
  });

  it('conserva el día cuando existe en el mes de destino', () => {
    expect(ymd(addMonthsClamped(at('2027-01-15T00:00:00Z'), 1))).toBe(
      '2027-02-15',
    );
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 12))).toBe(
      '2028-01-31',
    );
  });

  it('ajusta al último día cuando el día no existe (31 de marzo)', () => {
    expect(ymd(addMonthsClamped(at('2027-03-31T00:00:00Z'), 1))).toBe(
      '2027-04-30',
    );
  });

  it('cambia de año correctamente', () => {
    expect(ymd(addMonthsClamped(at('2026-12-31T00:00:00Z'), 1))).toBe(
      '2027-01-31',
    );
    expect(ymd(addMonthsClamped(at('2027-12-31T00:00:00Z'), 2))).toBe(
      '2028-02-29',
    );
  });

  it('suma varios meses con duraciones de garantía soportadas', () => {
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 15))).toBe(
      '2028-04-30',
    );
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 18))).toBe(
      '2028-07-31',
    );
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 24))).toBe(
      '2029-01-31',
    );
  });

  it('un 29 de febrero bisiesto + 12 meses cae en 28 de febrero', () => {
    expect(ymd(addMonthsClamped(at('2028-02-29T00:00:00Z'), 12))).toBe(
      '2029-02-28',
    );
  });

  it('es determinista: misma entrada produce el mismo resultado', () => {
    const b = at('2027-01-31T00:00:00Z');
    expect(addMonthsClamped(b, 1).getTime()).toBe(
      addMonthsClamped(b, 1).getTime(),
    );
  });

  it('conserva la hora del instante base', () => {
    expect(addMonthsClamped(at('2027-01-31T14:35:00Z'), 1).toISOString()).toBe(
      '2027-02-28T14:35:00.000Z',
    );
  });

  it('no depende de la zona horaria del proceso (RNF-07)', () => {
    const original = process.env.TZ;
    const expected = addMonthsClamped(
      at('2027-01-31T00:00:00Z'),
      1,
    ).toISOString();
    try {
      for (const tz of ['UTC', 'America/Bogota', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        expect(
          addMonthsClamped(at('2027-01-31T00:00:00Z'), 1).toISOString(),
        ).toBe(expected);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('0 meses no altera la fecha', () => {
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 0))).toBe(
      '2027-01-31',
    );
  });

  it('entradas inválidas producen Invalid Date de forma explícita', () => {
    expect(Number.isNaN(addMonthsClamped(new Date(NaN), 1).getTime())).toBe(
      true,
    );
    expect(
      Number.isNaN(addMonthsClamped(at('2027-01-31T00:00:00Z'), NaN).getTime()),
    ).toBe(true);
    expect(
      Number.isNaN(
        addMonthsClamped(at('2027-01-31T00:00:00Z'), Infinity).getTime(),
      ),
    ).toBe(true);
  });

  it('trunca meses decimales a entero', () => {
    expect(ymd(addMonthsClamped(at('2027-01-31T00:00:00Z'), 1.9))).toBe(
      '2027-02-28',
    );
  });
});

describe('warrantyEnd (D-1 · fecha de compra; P1.8 · meses calendario)', () => {
  const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  it('se ancla en la fecha de compra del ERP, no en la instalación', () => {
    // D-1: la fecha de instalación NO puede sustituir a la de compra.
    const purchase = civil('2026-01-31');
    const installation = civil('2026-02-15');
    expect(ymd(warrantyEnd(purchase, 12)!)).toBe('2027-01-31');
    // Si se usara la instalación, el resultado sería 2027-02-15.
    expect(ymd(warrantyEnd(installation, 12)!)).toBe('2027-02-15');
  });

  it('suma meses calendario, no un multiplicador de días', () => {
    // 12 meses desde el 31 de enero conserva el día porque existe en enero.
    expect(ymd(warrantyEnd(civil('2026-01-31'), 12)!)).toBe('2027-01-31');
    // Antes la fórmula de días producía 2027-01-30 por el redondeo de 30.4375.
  });

  it('ajusta al último día del mes cuando el día no existe (P1.8)', () => {
    // 31 + 1 mes → 28/29 de febrero.
    expect(ymd(warrantyEnd(civil('2026-01-31'), 1)!)).toBe('2026-02-28');
    expect(ymd(warrantyEnd(civil('2028-01-31'), 1)!)).toBe('2028-02-29');
    // 30 + 1 mes → 28/29 de febrero.
    expect(ymd(warrantyEnd(civil('2026-01-30'), 1)!)).toBe('2026-02-28');
    expect(ymd(warrantyEnd(civil('2028-01-30'), 1)!)).toBe('2028-02-29');
    // 31 de marzo + 1 mes → 30 de abril.
    expect(ymd(warrantyEnd(civil('2026-03-31'), 1)!)).toBe('2026-04-30');
  });

  it('admite los plazos de garantía soportados y otros positivos', () => {
    for (const months of [1, 6, 12, 15, 18, 24] as const) {
      const end = warrantyEnd(civil('2026-01-15'), months);
      expect(end).not.toBeNull();
      expect(ymd(end!)).not.toBe('');
    }
    expect(ymd(warrantyEnd(civil('2026-01-15'), 6)!)).toBe('2026-07-15');
    expect(ymd(warrantyEnd(civil('2026-01-15'), 15)!)).toBe('2027-04-15');
    expect(ymd(warrantyEnd(civil('2026-01-15'), 18)!)).toBe('2027-07-15');
    expect(ymd(warrantyEnd(civil('2026-01-15'), 24)!)).toBe('2028-01-15');
  });

  it('sin garantía no hay ventana que comunicar', () => {
    expect(warrantyEnd(base, null)).toBeNull();
    expect(warrantyEnd(base, 0)).toBeNull();
  });

  it('las 4 duraciones soportadas producen ventanas distintas', () => {
    const ends = ([12, 15, 18, 24] as const).map((m) =>
      ymd(warrantyEnd(civil('2026-01-15'), m)!),
    );
    expect(new Set(ends).size).toBe(4);
    expect(ends).toEqual([
      '2027-01-15',
      '2027-04-15',
      '2027-07-15',
      '2028-01-15',
    ]);
  });

  it('es determinista: misma entrada, mismo vencimiento', () => {
    const purchase = civil('2026-01-31');
    expect(ymd(warrantyEnd(purchase, 18)!)).toBe(
      ymd(warrantyEnd(purchase, 18)!),
    );
  });
});

describe('ventana de reseña (§3)', () => {
  it('acepta los días 2 y 5', () => {
    expect(isWithinReviewWindow(base, at(2))).toBe(true);
    expect(isWithinReviewWindow(base, at(5))).toBe(true);
  });

  it('rechaza el día 1 y el día 6', () => {
    expect(isWithinReviewWindow(base, at(1))).toBe(false);
    expect(isWithinReviewWindow(base, at(6))).toBe(false);
  });
});

describe('mantenimiento (§3)', () => {
  it('primer intento a +60 y segundo a +67', () => {
    expect(diffInDays(maintenanceFirstAttemptAt(base), base)).toBe(60);
    expect(diffInDays(maintenanceSecondAttemptAt(base), base)).toBe(67);
  });

  it('el segundo intento es exactamente 7 días después del primero', () => {
    expect(
      diffInDays(
        maintenanceSecondAttemptAt(base),
        maintenanceFirstAttemptAt(base),
      ),
    ).toBe(7);
  });

  it('tras el segundo intento se detiene', () => {
    expect(nextMaintenanceAttempt(0)).toBe('FIRST');
    expect(nextMaintenanceAttempt(1)).toBe('SECOND');
    expect(nextMaintenanceAttempt(2)).toBe('STOP');
    expect(nextMaintenanceAttempt(9)).toBe('STOP');
  });
});

describe('hitos de garantía y post-vencimiento (§9, §13, §14)', () => {
  it('pre-vencimiento a -30 del fin de garantía', () => {
    const pre = preExpiryAt(base, 12)!;
    expect(diffInDays(warrantyEnd(base, 12)!, pre)).toBe(30);
  });

  it('+60 y +90 tras el vencimiento', () => {
    const end = warrantyEnd(base, 12)!;
    // diffInDays(later, earlier): el hito es posterior al vencimiento.
    expect(diffInDays(postExpiry60At(base, 12)!, end)).toBe(60);
    expect(diffInDays(postExpiry90At(base, 12)!, end)).toBe(90);
  });

  it('sin garantía no hay hitos post-vencimiento', () => {
    expect(preExpiryAt(base, null)).toBeNull();
    expect(postExpiry60At(base, null)).toBeNull();
    expect(postExpiry90At(base, null)).toBeNull();
  });
});

describe('G3 frecuencia global (§4.1)', () => {
  const now = at(100);

  it('sin envíos previos nunca bloquea', () => {
    expect(automaticFrequencyBlocks(null, now)).toBe(false);
  });

  it('bloquea con exactamente 15 días', () => {
    expect(automaticFrequencyBlocks(at(85), now)).toBe(true);
  });

  it('bloquea con menos de 15 días', () => {
    expect(automaticFrequencyBlocks(at(86), now)).toBe(true);
    expect(automaticFrequencyBlocks(at(99), now)).toBe(true);
  });

  it('permite con más de 15 días (día 16 es el primero elegible)', () => {
    expect(automaticFrequencyBlocks(at(84), now)).toBe(false);
  });
});

describe('G4 silencio manual (§4.2)', () => {
  const now = at(100);

  it('sin mensajes manuales nunca bloquea', () => {
    expect(manualSilenceBlocks(null, now)).toBe(false);
  });

  it('bloquea dentro de los 7 días', () => {
    expect(manualSilenceBlocks(at(94), now)).toBe(true);
    expect(manualSilenceBlocks(at(100), now)).toBe(true);
  });

  it('permite al día 8', () => {
    expect(manualSilenceBlocks(at(93), now)).toBe(false);
  });
});

describe('prioridad entre colisiones (§5)', () => {
  it('vencimiento gana a mantenimiento y a resto', () => {
    expect(winsCollision('WARRANTY_EXPIRY', 'MAINTENANCE_CONSENTED')).toBe(
      true,
    );
    expect(winsCollision('WARRANTY_EXPIRY', 'OTHER')).toBe(true);
  });

  it('mantenimiento gana a resto', () => {
    expect(winsCollision('MAINTENANCE_CONSENTED', 'OTHER')).toBe(true);
  });

  it('resto no gana a nada', () => {
    expect(winsCollision('OTHER', 'WARRANTY_EXPIRY')).toBe(false);
  });

  it('pickWinner elige la categoría de mayor prioridad', () => {
    expect(pickWinner(['OTHER', 'MAINTENANCE_CONSENTED'])).toBe(
      'MAINTENANCE_CONSENTED',
    );
    expect(
      pickWinner(['OTHER', 'WARRANTY_EXPIRY', 'MAINTENANCE_CONSENTED']),
    ).toBe('WARRANTY_EXPIRY');
    expect(pickWinner([])).toBeNull();
  });
});

describe('resoluciones de reclamación (§6.1)', () => {
  it('son exactamente 6 y cada una tiene efecto definido', () => {
    expect(COMPLAINT_RESOLUTIONS).toHaveLength(6);
    for (const r of COMPLAINT_RESOLUTIONS) {
      expect(RESOLUTION_EFFECTS[r]).toBeDefined();
    }
  });

  it('falsa alarma y problema técnico reanudan', () => {
    expect(RESOLUTION_EFFECTS.FALSE_ALARM.kind).toBe('RESUME');
    expect(RESOLUTION_EFFECTS.TECHNICAL_ISSUE_RESOLVED.kind).toBe('RESUME');
  });

  it('los tres de reemplazo/ devolucion terminan', () => {
    for (const r of [
      'BATTERY_REPLACED',
      'DEFECTIVE_PRODUCT_RETURNED',
      'DEFECTIVE_PRODUCT_REPLACED',
    ] as ComplaintResolutionValue[]) {
      expect(RESOLUTION_EFFECTS[r].kind).toBe('FINISH');
    }
  });

  it('sin contacto no termina el lifecycle', () => {
    expect(RESOLUTION_EFFECTS.UNRESOLVED_NO_CONTACT.kind).toBe('CONTINUE');
  });

  it('solo el reemplazo y la devolucion+reemplazo crean lifecycle nuevo', () => {
    expect(resolutionStartsNewCycle('BATTERY_REPLACED')).toBe(true);
    expect(resolutionStartsNewCycle('DEFECTIVE_PRODUCT_REPLACED')).toBe(true);
    expect(resolutionStartsNewCycle('DEFECTIVE_PRODUCT_RETURNED')).toBe(false);
    expect(resolutionStartsNewCycle('FALSE_ALARM')).toBe(false);
    expect(resolutionStartsNewCycle('UNRESOLVED_NO_CONTACT')).toBe(false);
  });
});
// ── T-C1: contrato canónico de la fuente de verdad temporal ────────────────
describe('T-C1 · contrato canónico del ciclo de vida', () => {
  const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  it('la GARANTÍA se ancla en la compra aunque la instalación sea distinta', () => {
    const compra = civil('2026-01-31');
    const instalacion = civil('2026-06-15');
    // Las dos fechas coexisten: la garantía ignora la instalación.
    expect(ymd(warrantyEnd(compra, 12)!)).toBe('2027-01-31');
    expect(ymd(warrantyEnd(instalacion, 12)!)).toBe('2027-06-15');
  });

  it('las etapas derivadas del vencimiento heredan la base de COMPRA', () => {
    const compra = civil('2026-01-31');
    const instalacion = civil('2026-06-15');
    // RF-07: preaviso 30 días antes del VENCIMIENTO, no de la instalación.
    expect(ymd(preExpiryAt(compra, 12)!)).toBe('2027-01-01');
    expect(ymd(preExpiryAt(instalacion, 12)!)).not.toBe(
      ymd(preExpiryAt(compra, 12)!),
    );
    // RF-06: +60d y +90d desde el vencimiento original.
    expect(ymd(postExpiry60At(compra, 12)!)).toBe('2027-04-01');
    expect(ymd(postExpiry90At(compra, 12)!)).toBe('2027-05-01');
    // Y ese vencimiento es el de la compra, no el de la instalación: como la
    // compra es anterior, su impacto también lo es.
    expect(postExpiry60At(compra, 12)!.getTime()).toBeLessThan(
      postExpiry60At(instalacion, 12)!.getTime(),
    );
    expect(ymd(postExpiry60At(instalacion, 12)!)).toBe('2027-08-14');
  });

  it('RF-06: los impactos de retención se miden desde el vencimiento ORIGINAL', () => {
    // +6m, +12m y +18m desde el vencimiento, no desde el impacto anterior.
    const end = warrantyEnd(civil('2026-01-31'), 12)!;
    expect(ymd(end)).toBe('2027-01-31');
    expect(ymd(addMonthsClamped(end, 6))).toBe('2027-07-31');
    expect(ymd(addMonthsClamped(end, 12))).toBe('2028-01-31');
    expect(ymd(addMonthsClamped(end, 18))).toBe('2028-07-31');
  });

  it('tratamiento de nulos: sin garantía no hay vencimiento ni etapas', () => {
    const compra = civil('2026-01-31');
    for (const months of [null, 0]) {
      expect(warrantyEnd(compra, months)).toBeNull();
      expect(preExpiryAt(compra, months)).toBeNull();
      expect(postExpiry60At(compra, months)).toBeNull();
      expect(postExpiry90At(compra, months)).toBeNull();
    }
  });

  it('idempotencia: recalcular no altera el resultado', () => {
    const compra = civil('2026-01-31');
    const primera = warrantyEnd(compra, 18)!;
    const segunda = warrantyEnd(compra, 18)!;
    expect(segunda.getTime()).toBe(primera.getTime());
    expect(ymd(segunda)).toBe('2027-07-31');
  });

  it('determinismo en los límites de mes y año', () => {
    const casos: Array<[string, number, string]> = [
      ['2026-01-31', 1, '2026-02-28'],
      ['2028-01-31', 1, '2028-02-29'],
      ['2026-01-30', 1, '2026-02-28'],
      ['2026-03-31', 1, '2026-04-30'],
      ['2026-12-31', 1, '2027-01-31'],
      ['2026-12-31', 2, '2027-02-28'],
      ['2028-12-31', 2, '2029-02-28'],
    ];
    for (const [base, months, esperado] of casos) {
      expect(ymd(warrantyEnd(civil(base), months)!)).toBe(esperado);
    }
  });

  it('coherencia entre consumidores: imports, compras y lifecycle coinciden', () => {
    // Las tres rutas calculan el vencimiento con la MISMA función compartida.
    const compra = civil('2026-01-31');
    const porLifecycle = warrantyEnd(compra, 12)!;
    const porCompras = addMonthsClamped(compra, 12);
    const porImports = addMonthsClamped(compra, 12);
    expect(ymd(porLifecycle)).toBe(ymd(porCompras));
    expect(ymd(porLifecycle)).toBe(ymd(porImports));
    expect(ymd(porLifecycle)).toBe('2027-01-31');
  });
});
