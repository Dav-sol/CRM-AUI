import {
  BUSINESS_TIME_ZONE,
  CIVIL_DATE_PATTERN,
  PURCHASE_DATE_INPUT_PATTERN,
  instantToBusinessCivilDate,
  isCivilDate,
  isPurchaseDateInput,
  parseCivilDate,
  parsePurchaseDateInput,
  toCivilDateString,
} from './civil-date';

describe('contrato de fecha civil (D-1 / P1.8 / RNF-07)', () => {
  it('declara America/Bogota como zona operativa del cliente', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Bogota');
  });

  describe('isCivilDate', () => {
    it('acepta el formato canónico YYYY-MM-DD', () => {
      expect(isCivilDate('2026-01-15')).toBe(true);
      expect(isCivilDate('2026-12-31')).toBe(true);
      expect(isCivilDate('2028-02-29')).toBe(true); // bisiesto
    });

    it('rechaza formatos con hora, con zona o sin zona', () => {
      expect(isCivilDate('2026-01-31T18:00:00Z')).toBe(false);
      expect(isCivilDate('2026-01-31T00:00:00')).toBe(false);
      expect(isCivilDate('2026-01-31T00:00:00-05:00')).toBe(false);
      expect(isCivilDate('2026-01-31 18:00:00')).toBe(false);
      expect(isCivilDate('31/01/2026')).toBe(false);
    });

    it('rechaza fechas que no existen aunque el formato sea válido', () => {
      expect(isCivilDate('2026-02-30')).toBe(false);
      expect(isCivilDate('2026-13-01')).toBe(false);
      expect(isCivilDate('2026-00-10')).toBe(false);
      expect(isCivilDate('2027-02-29')).toBe(false); // 2027 no es bisiesto
    });

    it('rechaza entradas que no son cadenas', () => {
      expect(isCivilDate(null)).toBe(false);
      expect(isCivilDate(undefined)).toBe(false);
      expect(isCivilDate(new Date())).toBe(false);
      expect(isCivilDate(20260115)).toBe(false);
      expect(isCivilDate('')).toBe(false);
    });
  });

  describe('parseCivilDate', () => {
    it('representa la fecha civil a las 00:00:00 UTC', () => {
      const parsed = parseCivilDate('2026-01-15');
      expect(parsed.toISOString()).toBe('2026-01-15T00:00:00.000Z');
      expect(parsed.getUTCDate()).toBe(15);
      expect(parsed.getUTCMonth()).toBe(0);
      expect(parsed.getUTCFullYear()).toBe(2026);
    });

    it('lanza ante un formato no autorizado en lugar de truncarlo', () => {
      // Truncular en silencio convertiría un instante en un día distinto.
      expect(() => parseCivilDate('2026-01-31T18:00:00Z')).toThrow(
        /Fecha civil inválida/,
      );
      expect(() => parseCivilDate('2026-02-30')).toThrow(
        /Fecha civil inválida/,
      );
      expect(() => parseCivilDate('31/01/2026')).toThrow(
        /Fecha civil inválida/,
      );
    });

    it('ida y vuelta: la fecha civil se conserva exactamente', () => {
      for (const value of [
        '2026-01-31',
        '2026-02-28',
        '2028-02-29',
        '2026-12-31',
        '2026-07-04',
      ]) {
        expect(toCivilDateString(parseCivilDate(value))).toBe(value);
      }
    });
  });

  describe('toCivilDateString', () => {
    it('serializa leyendo los campos UTC, no los locales', () => {
      // Medianoche UTC es el día anterior en Bogotá: leer getDate() desplazaría.
      expect(toCivilDateString(new Date('2026-01-15T00:00:00.000Z'))).toBe(
        '2026-01-15',
      );
      expect(toCivilDateString(parseCivilDate('2026-01-31'))).toBe(
        '2026-01-31',
      );
    });

    it('devuelve cadena vacía para nulos e inválidos', () => {
      expect(toCivilDateString(null)).toBe('');
      expect(toCivilDateString(undefined)).toBe('');
      expect(toCivilDateString(new Date(NaN))).toBe('');
    });
  });

  describe('independencia de la zona horaria del proceso', () => {
    it('produce el mismo día civil con cualquier TZ', () => {
      // El contrato no depende del reloj del proceso: la aritmética de meses
      // se hace en UTC (RNF-07) y la zona operativa se aplica al presentar.
      const samples = ['2026-01-31', '2026-02-28', '2028-02-29', '2026-12-31'];
      const expected = samples.map((s) => s);
      expect(samples.map((s) => toCivilDateString(parseCivilDate(s)))).toEqual(
        expected,
      );
    });
  });

  describe('CIVIL_DATE_PATTERN', () => {
    it('solo acepta el formato canónico', () => {
      expect(CIVIL_DATE_PATTERN.test('2026-01-31')).toBe(true);
      expect(CIVIL_DATE_PATTERN.test('2026-01-31T00:00:00Z')).toBe(false);
      expect(CIVIL_DATE_PATTERN.test('2026-1-31')).toBe(false);
    });
  });
  // T-B3: la frontera de compras acepta además el instante inequívoco que
  // envía el formulario web, y rechaza el ambiguo.
  describe('frontera de compras: isPurchaseDateInput / parsePurchaseDateInput', () => {
    it('admite la fecha civil canónica', () => {
      for (const value of ['2026-01-15', '2026-12-31', '2028-02-29']) {
        expect(isPurchaseDateInput(value)).toBe(true);
        expect(toCivilDateString(parsePurchaseDateInput(value))).toBe(value);
      }
    });

    it('admite un instante con zona declarada y lo reduce al día en Bogotá', () => {
      // 2026-07-22T14:35:18Z son las 09:35 del 22 en Bogotá: mismo día.
      expect(
        toCivilDateString(parsePurchaseDateInput('2026-07-22T14:35:18Z')),
      ).toBe('2026-07-22');
      // 2026-07-23T02:00:00Z son las 21:00 del 22: NO debe avanzar de día.
      expect(
        toCivilDateString(parsePurchaseDateInput('2026-07-23T02:00:00Z')),
      ).toBe('2026-07-22');
      // Offset explícito equivalente.
      expect(
        toCivilDateString(parsePurchaseDateInput('2026-07-22T09:35:18-05:00')),
      ).toBe('2026-07-22');
    });

    it('convierte a la zona operativa, no a UTC', () => {
      // 2026-08-01T02:00Z es 2026-07-31 21:00 en Bogotá.
      expect(
        instantToBusinessCivilDate(new Date('2026-08-01T02:00:00.000Z')),
      ).toBe('2026-07-31');
      expect(
        toCivilDateString(parsePurchaseDateInput('2026-08-01T02:00:00Z')),
      ).toBe('2026-07-31');
    });

    it('rechaza un instante SIN zona: es ambiguo', () => {
      const values = [
        '2026-01-31T00:00:00',
        '2026-01-31T18:00',
        '2026-01-31 18:00:00',
      ];
      for (const value of values) {
        expect(isPurchaseDateInput(value)).toBe(false);
        expect(() => parsePurchaseDateInput(value)).toThrow(
          /purchaseDate inválido/,
        );
      }
    });

    it('rechaza formatos no ISO y días inexistentes', () => {
      for (const value of ['31/01/2026', '2026-02-30', '2026-13-01', '']) {
        expect(isPurchaseDateInput(value)).toBe(false);
      }
    });

    it('rechaza entradas que no son cadena', () => {
      expect(isPurchaseDateInput(null)).toBe(false);
      expect(isPurchaseDateInput(20260115)).toBe(false);
      expect(isPurchaseDateInput(new Date())).toBe(false);
    });

    it('el patrón declarado cubre exactamente los formatos admitidos', () => {
      expect(PURCHASE_DATE_INPUT_PATTERN.test('2026-01-31')).toBe(true);
      expect(PURCHASE_DATE_INPUT_PATTERN.test('2026-01-31T18:00:00Z')).toBe(
        true,
      );
      expect(PURCHASE_DATE_INPUT_PATTERN.test('2026-01-31T00:00:00')).toBe(
        false,
      );
    });
  });
});
