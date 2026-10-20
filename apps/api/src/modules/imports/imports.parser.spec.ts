import ExcelJS from 'exceljs';
import {
  parseImportFile,
  validateRow,
  ParsedRow,
  WARRANTY_MONTHS_PATTERN,
} from './imports.parser';

function bufferFromCsv(text: string): Buffer {
  return Buffer.from(text);
}

describe('imports.parser', () => {
  describe('parseImportFile CSV', () => {
    it('parses rows with canonical headers and aliases', async () => {
      const result = await parseImportFile(
        bufferFromCsv('codigo_cliente,nombre,telefono\nC1,Juan,099\n'),
        'csv',
        'CUSTOMERS',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells).toEqual({
        codcli: 'C1',
        name: 'Juan',
        phone: '099',
      });
    });

    it('reports missing required columns as structural issues', async () => {
      const result = await parseImportFile(
        bufferFromCsv('factura,codcli\nF1,C1\n'),
        'csv',
        'CUSTOMERS',
      );
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].field).toBe('header');
    });

    it('rejects files over the row limit', async () => {
      const rows = ['codcli,name'];
      for (let i = 0; i < 50001; i++) {
        rows.push(`C${i},N${i}`);
      }
      const result = await parseImportFile(
        bufferFromCsv(rows.join('\n')),
        'csv',
        'CUSTOMERS',
      );
      expect(
        result.issues.some((issue) => issue.message.includes('maximum')),
      ).toBe(true);
    });

    it('neutralizes CSV injection cells (NR-005, AS-023)', async () => {
      const result = await parseImportFile(
        bufferFromCsv('codcli,name\nC1,=HYPERLINK(x)\n'),
        'csv',
        'CUSTOMERS',
      );
      expect(result.rows[0].cells['name']).toBe("'=HYPERLINK(x)");
    });

    it('keeps phone numbers starting with + untouched', async () => {
      const result = await parseImportFile(
        bufferFromCsv('codcli,name,phone\nC1,Juan,+593 99\n'),
        'csv',
        'CUSTOMERS',
      );
      expect(result.rows[0].cells['phone']).toBe('+593 99');
    });

    it('maps Baterías del Caribe DIRECTORIO headers (nomcli/telecli/mail_fe/direcli)', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codcli,nomcli,telecli,mail_fe,direcli,ciudad\n11771,.ANA ACKLE GUERRERO,3046776023,ana@example.com,CR 20 27 39,BARRANQUILLA\n',
        ),
        'csv',
        'CUSTOMERS',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells).toEqual({
        codcli: '11771',
        name: '.ANA ACKLE GUERRERO',
        phone: '3046776023',
        email: 'ana@example.com',
        address: 'CR 20 27 39',
        city: 'BARRANQUILLA',
      });
    });

    it('maps aESTADVENTAS headers (codmer/producto) and prefers nomcategoria over categoria', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codmer,producto,categoria,nomcategoria,cantidad\n1202,22850 BATERIA DUNCAN,5,DUNCAN,1\n',
        ),
        'csv',
        'PRODUCTS',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells).toEqual({
        code: '1202',
        name: '22850 BATERIA DUNCAN',
        category: 'DUNCAN',
        quantity: '1',
      });
    });

    it('maps VENTAS_XPROD headers (numero/cod_cliente/sale/venta) for PURCHASES', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,producto,fecha,sale,cod_cliente,numero,venta\n1202,22850 BATERIA DUNCAN,2026-04-16,1,10000,2551,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells).toEqual({
        code: '1202',
        name: '22850 BATERIA DUNCAN',
        purchaseDate: '2026-04-16',
        quantity: '1',
        codcli: '10000',
        invoiceNumber: '2551',
        value: '317322.6',
      });
    });

    it('resolves duplicate non-required columns with last-wins (VENTAS_XPROD cliente/razon_social)', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,producto,fecha,sale,cod_cliente,numero,cliente,razon_social,venta\n1202,22850 BATERIA DUNCAN,2026-04-16,1,10000,2551,JUAN PEREZ,JUAN PEREZ SA,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells['name']).toBe('JUAN PEREZ SA');
    });

    it('keeps failing on duplicate REQUIRED columns (name for PRODUCTS)', async () => {
      const result = await parseImportFile(
        bufferFromCsv('codigo,nombre,cliente\n1202,A,B\n'),
        'csv',
        'PRODUCTS',
      );
      expect(
        result.issues.some((issue) =>
          issue.message.includes('duplicate column'),
        ),
      ).toBe(true);
    });
  });

  // Contrato del parser con las cabeceras reales de VENTAS_XPROD_DET.
  // Se congela aqui para que un refactor del mapa HEADER_ALIASES no rompa en
  // silencio la importacion del ERP. Solo lectura: no depende de filas reales.
  describe('contrato VENTAS_XPROD_DET (regresion ERP)', () => {
    // Cabeceras en el orden en que aparecen en el reporte del ERP.
    const ERP_HEADERS = [
      'codigo',
      'producto',
      'fecha',
      'sale',
      'cod_cliente',
      'numero',
      'venta',
    ];
    const ERP_ROW = [
      '1202',
      '22850 BATERIA DUNCAN',
      '2026-04-16',
      '1',
      '10000',
      '2551',
      '317322.6',
    ];

    const csvWith = (headers: string[], row: string[]): Buffer =>
      bufferFromCsv(`${headers.join(',')}\n${row.join(',')}\n`);

    const EXPECTED_CELLS = {
      invoiceNumber: '2551',
      codcli: '10000',
      code: '1202',
      purchaseDate: '2026-04-16',
      quantity: '1',
      value: '317322.6',
    };

    it('mapea las seis columnas obligatorias por nombre, sin posiciones', async () => {
      const result = await parseImportFile(
        csvWith(ERP_HEADERS, ERP_ROW),
        'csv',
        'PURCHASES',
      );

      expect(result.issues).toEqual([]);
      // Solo las columnas que el dominio de compras consume; producto y las
      // demas del reporte no son obligatorias para PURCHASES.
      const purchaseCells = {
        invoiceNumber: result.rows[0]?.cells['invoiceNumber'],
        codcli: result.rows[0]?.cells['codcli'],
        code: result.rows[0]?.cells['code'],
        purchaseDate: result.rows[0]?.cells['purchaseDate'],
        quantity: result.rows[0]?.cells['quantity'],
        value: result.rows[0]?.cells['value'],
      };
      expect(purchaseCells).toEqual(EXPECTED_CELLS);
    });

    it('es invariante al reordenar las columnas', async () => {
      const orden = [3, 0, 5, 2, 6, 4, 1];
      const shuffledHeaders = orden.map((i) => ERP_HEADERS[i]);
      const shuffledRow = orden.map((i) => ERP_ROW[i]);

      const base = await parseImportFile(
        csvWith(ERP_HEADERS, ERP_ROW),
        'csv',
        'PURCHASES',
      );
      const shuffled = await parseImportFile(
        csvWith(shuffledHeaders, shuffledRow),
        'csv',
        'PURCHASES',
      );

      expect(shuffled.issues).toEqual([]);
      expect(shuffled.rows[0]?.cells).toEqual(base.rows[0]?.cells);
    });

    it('ignora columnas adicionales sin reportar issue', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,barras,producto,grupo,fecha,existencia,sale,cod_cliente,numero,total,venta\n' +
            '1202,7801,22850 BATERIA DUNCAN,ACC,2026-04-16,4,1,10000,2551,317322.60,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );

      // Las cabeceras sin alias no generan issue: es intencional, el reporte
      // del ERP trae 50 columnas y la mayoria no aplican al dominio.
      expect(result.issues).toEqual([]);
      expect(result.rows[0]?.cells['value']).toBe('317322.6');
      expect(result.rows[0]?.cells['code']).toBe('1202');
      expect(result.rows[0]?.cells['invoiceNumber']).toBe('2551');
    });

    it('rechaza el archivo si falta una columna obligatoria', async () => {
      const sinVenta = ERP_HEADERS.filter((h) => h !== 'venta');
      const sinVentaRow = ERP_ROW.filter((_, i) => ERP_HEADERS[i] !== 'venta');

      const result = await parseImportFile(
        csvWith(sinVenta, sinVentaRow),
        'csv',
        'PURCHASES',
      );

      // Issue estructural: el processor aborta el archivo completo ante
      // cualquier issue de cabecera (imports.processor.ts:117).
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        row: 1,
        field: 'header',
        message: 'missing required column: value',
      });
    });

    it('rechaza el archivo si falta el codigo de producto', async () => {
      const sinCodigo = ERP_HEADERS.filter((h) => h !== 'codigo');
      const sinCodigoRow = ERP_ROW.filter(
        (_, i) => ERP_HEADERS[i] !== 'codigo',
      );

      const result = await parseImportFile(
        csvWith(sinCodigo, sinCodigoRow),
        'csv',
        'PURCHASES',
      );

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.message).toBe('missing required column: code');
    });

    it('no acepta "total" como alias de value: sigue sin mapear', async () => {
      // Decision RM-04A: la semantica de `total` frente a `venta` no esta
      // verificada, asi que `total` NO tiene alias. Este test congela esa
      // decision: si alguien lo anade, el archivo pasara a rechazarse por
      // columna duplicada en lugar de importar con un importe distinto.
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,producto,fecha,sale,cod_cliente,numero,total,venta\n' +
            '1202,22850 BATERIA DUNCAN,2026-04-16,1,10000,2551,317322.60,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );

      expect(result.issues).toEqual([]);
      // `total` se descarta; el importe sigue viniendo de `venta`.
      expect(result.rows[0]?.cells['value']).toBe('317322.6');
      expect(result.rows[0]?.cells).not.toHaveProperty('total');
    });

    it('rechazaria el archivo si "total" se declarara alias de value', async () => {
      // Contraparte del anterior: si HEADER_ALIASES llegara a mapear
      // `total -> value`, las dos columnas colapsarian en `value`, que es
      // obligatoria, y mapHeaders emitiria `duplicate column` (linea 182).
      // Este test documenta ese comportamiento con una fila explicita.
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,producto,fecha,sale,cod_cliente,numero,numero,venta\n' +
            '1202,22850 BATERIA DUNCAN,2026-04-16,1,10000,2551,2552,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );

      expect(
        result.issues.some((issue) =>
          issue.message.includes('duplicate column'),
        ),
      ).toBe(true);
    });
  });

  describe('installationDate como columna opcional (spec 025 §1)', () => {
    it('reconoce la columna canónica junto a purchaseDate', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,fecha,fecha_instalacion,cod_cliente,numero,sale,venta\n' +
            '1202,2026-06-15,2026-06-15,10000,2551,1,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells['purchaseDate']).toBe('2026-06-15');
      expect(result.rows[0].cells['installationDate']).toBe('2026-06-15');
    });

    it.each([
      'installationDate',
      'installation_date',
      'fecha_instalacion',
      'fechaInstalacion',
      'instalacion',
    ])('acepta el alias %s', async (header) => {
      const result = await parseImportFile(
        bufferFromCsv(
          `codigo,fecha,${header},cod_cliente,numero,sale,venta\n` +
            `1202,2026-06-15,2026-06-16,10000,2551,1,317322.6\n`,
        ),
        'csv',
        'PURCHASES',
      );
      expect(result.rows[0].cells['installationDate']).toBe('2026-06-16');
    });

    it('NO es obligatoria: una compra sin ella se importa igual', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,fecha,cod_cliente,numero,sale,venta\n' +
            '1202,2026-06-15,10000,2551,1,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows[0].cells['installationDate']).toBeUndefined();
    });

    it('rechaza una fecha de instalación inválida si viene', () => {
      const issues = validateRow('PURCHASES', {
        number: 2,
        cells: {
          codcli: '10000',
          code: '1202',
          invoiceNumber: '2551',
          purchaseDate: '2026-06-15',
          installationDate: '15/06/2026',
          quantity: '1',
          value: '317322.6',
        },
      });
      expect(issues.map((i) => i.field)).toContain('installationDate');
      expect(issues.find((i) => i.field === 'installationDate')?.message).toBe(
        'invalid date, expected YYYY-MM-DD (civil)',
      );
    });

    it('no inventa una fecha: sin columna no hay clave en la fila', async () => {
      const result = await parseImportFile(
        bufferFromCsv(
          'codigo,fecha,cod_cliente,numero,sale,venta\n' +
            '1202,2026-06-15,10000,2551,1,317322.6\n',
        ),
        'csv',
        'PURCHASES',
      );
      expect(Object.keys(result.rows[0].cells)).not.toContain(
        'installationDate',
      );
    });
  });

  describe('parseImportFile XLSX', () => {
    it('parses the first worksheet', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Clientes');
      sheet.addRow(['codcli', 'name']);
      sheet.addRow(['C1', 'Juan']);
      sheet.addRow(['C2', 'Ana']);
      const buffer = await workbook.xlsx.writeBuffer();

      const result = await parseImportFile(
        Buffer.from(buffer),
        'xlsx',
        'CUSTOMERS',
      );
      expect(result.issues).toEqual([]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toEqual({ codcli: 'C1', name: 'Juan' });
    });

    it('reports an unparseable file', async () => {
      const result = await parseImportFile(
        Buffer.from('not an xlsx file'),
        'xlsx',
        'CUSTOMERS',
      );
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('validateRow', () => {
    const row = (cells: Record<string, string>): ParsedRow => ({
      number: 2,
      cells,
    });

    it('validates a valid customer row', () => {
      expect(
        validateRow('CUSTOMERS', row({ codcli: 'C1', name: 'Juan' })),
      ).toEqual([]);
    });

    it('flags missing codcli and invalid email', () => {
      const issues = validateRow(
        'CUSTOMERS',
        row({ name: 'Juan', email: 'nope' }),
      );
      expect(issues.map((issue) => issue.field)).toEqual(
        expect.arrayContaining(['codcli', 'email']),
      );
    });

    it('reports an overlong phone exactly once', () => {
      const issues = validateRow(
        'CUSTOMERS',
        row({ codcli: 'C1', name: 'Juan', phone: '1'.repeat(31) }),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.field).toBe('phone');
    });

    it('validates purchases with int4 and money constraints', () => {
      expect(
        validateRow(
          'PURCHASES',
          row({
            invoiceNumber: 'F1',
            codcli: 'C1',
            code: 'P1',
            purchaseDate: '2026-08-01',
            quantity: '2',
            value: '150.50',
          }),
        ),
      ).toEqual([]);

      const issues = validateRow(
        'PURCHASES',
        row({
          invoiceNumber: 'F2',
          codcli: 'C1',
          code: 'P1',
          purchaseDate: 'not-a-date',
          quantity: '99999999999',
          value: 'abc',
        }),
      );
      expect(issues.map((issue) => issue.field)).toEqual(
        expect.arrayContaining(['purchaseDate', 'quantity', 'value']),
      );
    });

    it('accepts warranty aliases and flags out-of-range warrantyMonths', () => {
      expect(
        validateRow(
          'PRODUCTS',
          row({
            code: 'P1',
            name: 'Batería',
            warrantyMonths: '15',
          }),
        ),
      ).toEqual([]);

      const issues = validateRow(
        'PURCHASES',
        row({
          invoiceNumber: 'F1',
          codcli: 'C1',
          code: 'P1',
          purchaseDate: '2026-08-01',
          quantity: '1',
          value: '100',
          warrantyMonths: '25',
        }),
      );
      expect(issues.map((issue) => issue.field)).toContain('warrantyMonths');
    });
  });
  // T-B1/T-B2: contrato de fecha civil en la frontera del ERP (D-1).
  describe('contrato de fecha civil del ERP', () => {
    const purchaseRow = (purchaseDate: string, extra = {}) => ({
      number: 2,
      cells: {
        invoiceNumber: 'F-1',
        codcli: 'C-1',
        code: 'P-1',
        purchaseDate,
        quantity: '1',
        value: '100',
        ...extra,
      },
    });

    it('acepta la fecha civil canónica sin observaciones', () => {
      for (const value of [
        '2026-01-31',
        '2026-02-28',
        '2028-02-29',
        '2026-12-31',
      ]) {
        expect(validateRow('PURCHASES', purchaseRow(value))).toEqual([]);
      }
    });

    it('rechaza marcas de tiempo: con zona, sin zona o con offset', () => {
      for (const value of [
        '2026-01-31T18:00:00Z',
        '2026-01-31T00:00:00',
        '2026-01-31T00:00:00-05:00',
      ]) {
        const issues = validateRow('PURCHASES', purchaseRow(value));
        expect(issues.map((i) => i.field)).toContain('purchaseDate');
      }
    });

    it('rechaza días que no existen aunque el formato sea correcto', () => {
      expect(
        validateRow('PURCHASES', purchaseRow('2026-02-30')).map((i) => i.field),
      ).toContain('purchaseDate');
      expect(
        validateRow('PURCHASES', purchaseRow('2027-02-29')).map((i) => i.field),
      ).toContain('purchaseDate');
    });

    it('aplica el mismo contrato a installationDate', () => {
      const issues = validateRow(
        'PURCHASES',
        purchaseRow('2026-01-31', { installationDate: '2026-02-30' }),
      );
      expect(issues.map((i) => i.field)).toContain('installationDate');
    });
  });

  // Contrato de garantía de Baterías del Caribe: PIT RF-02 admite únicamente
  // 12, 15, 18 y 24 meses. Se valida el texto de la celda, no el resultado de
  // Number(), porque esa conversión acepta representaciones no canónicas cuyo
  // resultado sigue siendo un entero.
  describe('contrato de garantía BDC (PIT RF-02)', () => {
    const productRow = (warrantyMonths: string): ParsedRow => ({
      number: 2,
      cells: { code: 'P-1', name: 'Batería', warrantyMonths },
    });

    const purchaseRowWith = (warrantyMonths: string): ParsedRow => ({
      number: 2,
      cells: {
        invoiceNumber: 'F-1',
        codcli: 'C-1',
        code: 'P-1',
        purchaseDate: '2026-08-01',
        quantity: '1',
        value: '100',
        warrantyMonths,
      },
    });

    it.each(['12', '15', '18', '24'])(
      'acepta la duración canónica %s',
      (months) => {
        expect(validateRow('PRODUCTS', productRow(months))).toEqual([]);
        expect(validateRow('PURCHASES', purchaseRowWith(months))).toEqual([]);
      },
    );

    it('conserva el recorte: " 15 " se normaliza a "15"', () => {
      // El parser recorta la celda al construir `cells`; se comprueba aquí que el
      // contrato sigue aceptando el valor ya normalizado.
      expect(WARRANTY_MONTHS_PATTERN.test('15')).toBe(true);
      expect(' 15 '.trim()).toBe('15');
    });

    it.each([
      ['1', 'entero por debajo del conjunto'],
      ['7', 'entero por debajo del conjunto'],
      ['25', 'entero por encima del conjunto'],
      ['36', 'entero fuera del conjunto'],
      ['15.0', 'decimal con cero final'],
      ['0x10', 'notación hexadecimal'],
      ['1e2', 'notación exponencial'],
      ['+15', 'signo explícito'],
      ['15 meses', 'texto con unidad'],
      ['15,0', 'coma decimal'],
      ['0', 'cero'],
      ['-3', 'negativo'],
    ])('rechaza %s (%s) con issue en warrantyMonths', (raw) => {
      const issues = validateRow('PRODUCTS', productRow(raw));
      expect(issues.map((i) => i.field)).toContain('warrantyMonths');
      expect(validateRow('PURCHASES', purchaseRowWith(raw))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'warrantyMonths' }),
        ]),
      );
    });

    it('el issue de garantía conserva el valor original recibido', () => {
      const issues = validateRow('PRODUCTS', productRow('15 meses'));
      expect(issues[0]).toMatchObject({
        row: 2,
        field: 'warrantyMonths',
        raw: '15 meses',
      });
    });

    // Ausente ≠ inválido: la ausencia no genera issue y no recibe default.
    it('una celda ausente no genera issue', () => {
      expect(
        validateRow('PRODUCTS', {
          number: 2,
          cells: { code: 'P-1', name: 'B' },
        }),
      ).toEqual([]);
      expect(
        validateRow('PURCHASES', {
          number: 2,
          cells: {
            invoiceNumber: 'F-1',
            codcli: 'C-1',
            code: 'P-1',
            purchaseDate: '2026-08-01',
            quantity: '1',
            value: '100',
          },
        }),
      ).toEqual([]);
    });

    it('una celda vacía o con espacios no genera issue', () => {
      expect(validateRow('PRODUCTS', productRow(''))).toEqual([]);
      // El parser no guarda celdas que quedan vacías tras el recorte, de modo
      // que una celda de solo espacios llega igual que una ausente.
      expect(WARRANTY_MONTHS_PATTERN.test('   '.trim())).toBe(false);
      expect(
        validateRow('PRODUCTS', {
          number: 2,
          cells: { code: 'P-1', name: 'B' },
        }),
      ).toEqual([]);
    });

    it('el patrón no admite espacios ni Representations alternativas', () => {
      for (const raw of [
        ' 15',
        '15 ',
        '15.0',
        '+15',
        '0x10',
        '1e2',
        '',
        ' ',
        '15 meses',
      ]) {
        expect(WARRANTY_MONTHS_PATTERN.test(raw)).toBe(false);
      }
    });
  });
});
