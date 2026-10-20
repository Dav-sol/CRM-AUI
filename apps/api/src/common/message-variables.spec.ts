/**
 * Presentación de fechas en plantillas de mensaje (RNF-07).
 *
 * Cubre el requisito de T-D4: el texto que ve el destinatario no debe depender
 * del reloj del servidor.
 *
 * Las aserciones NO mutan `process.env.TZ`: ICU cachea la zona resuelta, así
 * que cambiarla en runtime no surte efecto. La independencia de zona horaria
 * se demuestra ejecutando este mismo archivo con distintas variables de
 * entorno `TZ` (ver el reporte de T-D4); aquí se fija el resultado único que
 * debe_anyadir_ en todas ellas.
 */
import {
  DEFAULT_PRESENTATION_TIME_ZONE,
  formatVariableDate,
  renderTemplate,
} from './message-variables';

describe('formatVariableDate', () => {
  it('usa America/Bogota como zona de presentación por defecto', () => {
    expect(DEFAULT_PRESENTATION_TIME_ZONE).toBe('America/Bogota');
  });

  it('formatea en el día civil de Bogotá, no en UTC', () => {
    // Medianoche UTC del 31 cae el día 30 en Bogotá (UTC-5).
    expect(formatVariableDate('2026-01-31T00:00:00.000Z')).toBe(
      '30 de enero de 2026',
    );
    // Un instante dentro del día conserva el día en ambas zonas.
    expect(formatVariableDate('2026-01-15T12:00:00.000Z')).toBe(
      '15 de enero de 2026',
    );
  });

  it('resuelve el cambio de mes y de año', () => {
    expect(formatVariableDate('2026-03-31T00:00:00.000Z')).toBe(
      '30 de marzo de 2026',
    );
    expect(formatVariableDate('2026-12-31T00:00:00.000Z')).toBe(
      '30 de diciembre de 2026',
    );
    expect(formatVariableDate('2027-01-01T00:00:00.000Z')).toBe(
      '31 de diciembre de 2026',
    );
  });

  it('devuelve cadena vacía para valores nulos, vacíos o inválidos', () => {
    expect(formatVariableDate(null)).toBe('');
    expect(formatVariableDate(undefined)).toBe('');
    expect(formatVariableDate('')).toBe('');
    expect(formatVariableDate('no-es-una-fecha')).toBe('');
    expect(formatVariableDate(new Date(NaN))).toBe('');
  });

  it('acepta un objeto Date igual que un string ISO', () => {
    expect(formatVariableDate(new Date('2026-01-15T12:00:00.000Z'))).toBe(
      formatVariableDate('2026-01-15T12:00:00.000Z'),
    );
  });

  it('acepta un offset explícito', () => {
    expect(formatVariableDate('2026-01-15T12:00:00-05:00')).toBe(
      '15 de enero de 2026',
    );
  });

  it('es estable mientras el instante caiga dentro del día en Bogotá', () => {
    // 05:00Z es la medianoche de Bogotá (UTC-5): 05:00Z–04:59Z del día
    // siguiente es el mismo día civil local.
    for (const iso of [
      '2026-01-15T05:00:00.000Z',
      '2026-01-15T11:00:00.000Z',
      '2026-01-15T17:00:00.000Z',
      '2026-01-16T04:59:00.000Z',
    ]) {
      expect(formatVariableDate(iso)).toBe('15 de enero de 2026');
    }
  });

  it('permite sobreescribir la zona para organizaciones fuera de Colombia', () => {
    const value = '2026-01-15T02:00:00.000Z'; // 21:00 del 14 en Bogotá
    expect(formatVariableDate(value)).toBe('14 de enero de 2026');
    expect(formatVariableDate(value, 'America/Bogota')).toBe(
      '14 de enero de 2026',
    );
    expect(formatVariableDate(value, 'Asia/Tokyo')).toBe('15 de enero de 2026');
  });

  it('dos organizaciones con zonas distintas producen días distintos', () => {
    // 23:30Z del 14 → 18:30 del 14 en Bogotá, 08:30 del 15 en Tokio.
    const value = '2026-01-14T23:30:00.000Z';
    expect(formatVariableDate(value, 'America/Bogota')).toBe(
      '14 de enero de 2026',
    );
    expect(formatVariableDate(value, 'Asia/Tokyo')).toBe('15 de enero de 2026');
  });

  it('cae al valor por defecto si la zona configurada es inválida', () => {
    // El DTO valida el formato pero no que la zona exista: una configuración
    // con un identificador inexistente no debe romper el renderizado.
    const value = '2026-01-15T02:00:00.000Z';
    expect(formatVariableDate(value, 'Europe/Nowhere')).toBe(
      formatVariableDate(value),
    );
    expect(formatVariableDate(value, '')).toBe(formatVariableDate(value));
  });
});

describe('renderTemplate', () => {
  const vars = {
    customerName: 'Ana',
    productName: 'Batería X',
    organizationName: 'BDC',
    brand: 'ACME',
    purchaseDate: '2026-01-31T00:00:00.000Z',
    warrantyExpiresAt: '2027-01-31T00:00:00.000Z',
  };

  it('sustituye las variables de texto sin alterarlas', () => {
    const out = renderTemplate(
      'Hola {customerName}, tu {productName} de {brand} en {organizationName}',
      vars,
    );
    expect(out).toBe('Hola Ana, tu Batería X de ACME en BDC');
  });

  it('renderiza las fechas civiles como el día registrado', () => {
    // `purchaseDate` y `warrantyExpiresAt` son columnas DATE: el día es el que
    // registró el negocio y no debe desplazarse por la zona de presentación.
    expect(renderTemplate('Compra: {purchaseDate}', vars)).toBe(
      'Compra: 31 de enero de 2026',
    );
    expect(renderTemplate('Vence: {warrantyExpiresAt}', vars)).toBe(
      'Vence: 31 de enero de 2027',
    );
  });

  it('no deja el placeholder sin sustituir cuando la fecha falta', () => {
    const out = renderTemplate('Compra: {purchaseDate}', {
      ...vars,
      purchaseDate: null,
    });
    expect(out).toBe('Compra: ');
  });

  it('deja intactas las variables que no aparecen en la plantilla', () => {
    expect(renderTemplate('{customerName}', vars)).toBe('Ana');
  });

  it('no depende del reloj del proceso al renderizar', () => {
    // El resultado esperado es único; si el formateador volviera a depender
    // del TZ del proceso, esta aserción fallaría con `TZ=UTC`.
    expect(renderTemplate('Compra: {purchaseDate}', vars)).toBe(
      'Compra: 31 de enero de 2026',
    );
    expect(renderTemplate('Vence: {warrantyExpiresAt}', vars)).toBe(
      'Vence: 31 de enero de 2027',
    );
  });

  it('mantiene el día civil aunque se pase otra zona de presentación', () => {
    // Una fecha civil no es un instante: la zona no puede desplazarla. La
    // zona sigue siendo relevante para variables de tipo instante (ver
    // `formatVariableDate`).
    const template = 'Compra: {purchaseDate}';
    expect(renderTemplate(template, vars, 'America/Bogota')).toBe(
      'Compra: 31 de enero de 2026',
    );
    expect(renderTemplate(template, vars, 'Asia/Tokyo')).toBe(
      'Compra: 31 de enero de 2026',
    );
  });
});
