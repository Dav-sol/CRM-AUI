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
