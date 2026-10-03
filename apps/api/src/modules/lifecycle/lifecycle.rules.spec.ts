import {
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

describe('warrantyEnd (§1)', () => {
  it('cuenta desde la instalación, no desde la venta', () => {
    const end = warrantyEnd(base, 12);
    expect(diffInDays(end!, base)).toBe(365);
  });

  it('sin garantía no hay ventana que comunicar', () => {
    expect(warrantyEnd(base, null)).toBeNull();
    expect(warrantyEnd(base, 0)).toBeNull();
  });

  it('las 4 duraciones soportadas producen ventanas distintas', () => {
    const ends = ([12, 15, 18, 24] as const).map((m) =>
      diffInDays(warrantyEnd(base, m)!, base),
    );
    expect(new Set(ends).size).toBe(4);
    expect(ends.every((d) => d > 300 && d < 800)).toBe(true);
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
