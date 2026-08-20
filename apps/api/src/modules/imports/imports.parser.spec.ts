import ExcelJS from 'exceljs';
import { parseImportFile, validateRow, ParsedRow } from './imports.parser';

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
        result.issues.some((issue) => issue.message.includes('duplicate column')),
      ).toBe(true);
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
  });
});
