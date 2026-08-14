import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { ImportType } from '@prisma/client';
import {
  DATE_PATTERN,
  EMAIL_PATTERN,
  MAX_INT,
  MAX_ROWS,
  MONEY_PATTERN,
} from './imports.constants';
import type { ImportFileFormat } from './file-validator.service';

export interface ParsedRow {
  number: number;
  cells: Record<string, string>;
}

export interface RowIssue {
  row: number;
  field: string;
  message: string;
  raw?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  issues: RowIssue[];
}

const HEADER_ALIASES: Record<string, string> = {
  codcli: 'codcli',
  codcliente: 'codcli',
  codigo_cliente: 'codcli',
  customer_code: 'codcli',
  name: 'name',
  nombre: 'name',
  cliente: 'name',
  razon_social: 'name',
  phone: 'phone',
  telefono: 'phone',
  email: 'email',
  correo: 'email',
  correo_electronico: 'email',
  address: 'address',
  direccion: 'address',
  city: 'city',
  ciudad: 'city',
  code: 'code',
  codigo: 'code',
  codigo_producto: 'code',
  product_code: 'code',
  category: 'category',
  categoria: 'category',
  status: 'status',
  estado: 'status',
  invoice_number: 'invoiceNumber',
  invoice: 'invoiceNumber',
  factura: 'invoiceNumber',
  numero_factura: 'invoiceNumber',
  purchase_date: 'purchaseDate',
  fecha: 'purchaseDate',
  fecha_compra: 'purchaseDate',
  fecha_factura: 'purchaseDate',
  quantity: 'quantity',
  cantidad: 'quantity',
  value: 'value',
  valor: 'value',
  monto: 'value',
  invoicenumber: 'invoiceNumber',
  purchasedate: 'purchaseDate',
  fechacompra: 'purchaseDate',
  fechafactura: 'purchaseDate',
  razonsocial: 'name',
  codigocliente: 'codcli',
  codigoproducto: 'code',
  numerofactura: 'invoiceNumber',
  correoelectronico: 'email',
};

const REQUIRED_COLUMNS: Record<ImportType, string[]> = {
  CUSTOMERS: ['codcli', 'name'],
  PRODUCTS: ['code', 'name'],
  PURCHASES: [
    'invoiceNumber',
    'codcli',
    'code',
    'purchaseDate',
    'quantity',
    'value',
  ],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function sanitizeCell(value: string): string {
  if (/^[=@\t\r]/.test(value) || /^[+-][^0-9]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function toCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const record = value as { text?: string; richText?: { text: string }[] };
    if (record.text !== undefined) {
      return String(record.text);
    }
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => part.text).join('');
    }
    const result = (value as { result?: unknown }).result;
    if (result !== undefined && result !== null) {
      return toCellText(result);
    }
    return '';
  }
  return '';
}

function mapHeaders(
  headers: string[],
  type: ImportType,
  issues: RowIssue[],
): string[] {
  const seen = new Set<string>();
  const columnIndexes: string[] = [];

  for (const header of headers) {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];
    if (!canonical) {
      columnIndexes.push('');
      continue;
    }
    if (seen.has(canonical)) {
      issues.push({
        row: 1,
        field: 'header',
        message: `duplicate column: ${header}`,
        raw: header,
      });
      columnIndexes.push('');
      continue;
    }
    seen.add(canonical);
    columnIndexes.push(canonical);
  }

  for (const required of REQUIRED_COLUMNS[type]) {
    if (!seen.has(required)) {
      issues.push({
        row: 1,
        field: 'header',
        message: `missing required column: ${required}`,
      });
    }
  }

  return columnIndexes;
}

function parseCsv(buffer: Buffer, type: ImportType): ParseResult {
  const issues: RowIssue[] = [];
  let records: string[][] = [];

  try {
    records = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    });
  } catch {
    issues.push({
      row: 1,
      field: '_file',
      message: 'file could not be parsed as CSV',
    });
    return { rows: [], issues };
  }

  if (records.length === 0) {
    issues.push({ row: 1, field: '_file', message: 'file is empty' });
    return { rows: [], issues };
  }

  const columnIndexes = mapHeaders(records[0] ?? [], type, issues);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const record = records[i] ?? [];
    const cells: Record<string, string> = {};
    for (let c = 0; c < columnIndexes.length; c++) {
      const column = columnIndexes[c];
      if (!column) {
        continue;
      }
      const value = sanitizeCell((record[c] ?? '').trim());
      if (value !== '') {
        cells[column] = value;
      }
    }
    rows.push({ number: i + 1, cells });
  }

  if (rows.length > MAX_ROWS) {
    issues.push({
      row: 1,
      field: '_file',
      message: `row count exceeds the maximum of ${MAX_ROWS}`,
    });
  }

  return { rows, issues };
}

function rowValues(row: ExcelJS.Row): unknown[] {
  const values = row.values;
  return Array.isArray(values) ? values.slice(1) : [];
}

async function parseXlsx(
  buffer: Buffer,
  type: ImportType,
): Promise<ParseResult> {
  const issues: RowIssue[] = [];
  const rows: ParsedRow[] = [];
  let headers: string[] = [];
  let columnIndexes: string[] = [];

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('EMPTY_BOOK');
    }

    const allRows = worksheet.getRows(1, worksheet.rowCount) ?? [];
    if (allRows.length === 0) {
      throw new Error('EMPTY_BOOK');
    }

    headers = rowValues(allRows[0]).map(toCellText);
    columnIndexes = mapHeaders(headers, type, issues);

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row) {
        continue;
      }
      const values = rowValues(row).map(toCellText);
      if (values.every((value) => value === '')) {
        continue;
      }
      const cells: Record<string, string> = {};
      for (let c = 0; c < columnIndexes.length; c++) {
        const column = columnIndexes[c];
        if (!column) {
          continue;
        }
        const value = sanitizeCell((values[c] ?? '').trim());
        if (value !== '') {
          cells[column] = value;
        }
      }
      rows.push({ number: i + 1, cells });
    }
  } catch {
    issues.push({
      row: 1,
      field: '_file',
      message: 'file could not be parsed as XLSX',
    });
    return { rows: [], issues };
  }

  if (rows.length > MAX_ROWS) {
    issues.push({
      row: 1,
      field: '_file',
      message: `row count exceeds the maximum of ${MAX_ROWS}`,
    });
  }

  return { rows, issues };
}

export async function parseImportFile(
  buffer: Buffer,
  format: ImportFileFormat,
  type: ImportType,
): Promise<ParseResult> {
  if (format === 'xlsx') {
    return parseXlsx(buffer, type);
  }
  return parseCsv(buffer, type);
}

const PRODUCT_STATUSES = new Set(['ACTIVE', 'INACTIVE']);
const PURCHASE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED']);

function pushIssue(
  issues: RowIssue[],
  row: number,
  field: string,
  message: string,
  raw?: string,
): void {
  issues.push({ row, field, message, raw: raw?.slice(0, 200) });
}

export function validateRow(type: ImportType, row: ParsedRow): RowIssue[] {
  const issues: RowIssue[] = [];
  const cells = row.cells;

  const text = (field: string, maxLength: number): string => {
    const value = cells[field] ?? '';
    if (value.length > maxLength) {
      pushIssue(
        issues,
        row.number,
        field,
        `value exceeds ${maxLength} characters`,
        value,
      );
    }
    return value;
  };

  if (type === 'CUSTOMERS') {
    const codcli = text('codcli', 50);
    if (!codcli) {
      pushIssue(issues, row.number, 'codcli', 'codcli is required');
    }
    const name = text('name', 200);
    if (!name) {
      pushIssue(issues, row.number, 'name', 'name is required');
    }
    text('phone', 30);
    const email = text('email', 254);
    if (email && !EMAIL_PATTERN.test(email)) {
      pushIssue(issues, row.number, 'email', 'invalid email format', email);
    }
    text('address', 200);
    text('city', 200);
    return issues;
  }

  if (type === 'PRODUCTS') {
    const code = text('code', 50);
    if (!code) {
      pushIssue(issues, row.number, 'code', 'code is required');
    }
    const name = text('name', 200);
    if (!name) {
      pushIssue(issues, row.number, 'name', 'name is required');
    }
    text('category', 100);
    const status = cells['status'] ?? '';
    if (status && !PRODUCT_STATUSES.has(status.toUpperCase())) {
      pushIssue(
        issues,
        row.number,
        'status',
        `invalid status: ${status}`,
        status,
      );
    }
    return issues;
  }

  const invoiceNumber = text('invoiceNumber', 50);
  if (!invoiceNumber) {
    pushIssue(issues, row.number, 'invoiceNumber', 'invoiceNumber is required');
  }
  const codcli = text('codcli', 50);
  if (!codcli) {
    pushIssue(issues, row.number, 'codcli', 'codcli is required');
  }
  const code = text('code', 50);
  if (!code) {
    pushIssue(issues, row.number, 'code', 'code is required');
  }

  const purchaseDate = cells['purchaseDate'] ?? '';
  if (!purchaseDate || !DATE_PATTERN.test(purchaseDate)) {
    pushIssue(
      issues,
      row.number,
      'purchaseDate',
      'invalid date, expected YYYY-MM-DD',
      purchaseDate,
    );
  }

  const quantity = cells['quantity'] ?? '';
  if (
    !/^\d+$/.test(quantity) ||
    Number(quantity) < 1 ||
    Number(quantity) > MAX_INT
  ) {
    pushIssue(
      issues,
      row.number,
      'quantity',
      'quantity must be an integer between 1 and 2147483647',
      quantity,
    );
  }

  const value = cells['value'] ?? '';
  if (!value || !MONEY_PATTERN.test(value)) {
    pushIssue(
      issues,
      row.number,
      'value',
      'invalid value, expected up to 10 digits with up to 2 decimals',
      value,
    );
  }

  const status = cells['status'] ?? '';
  if (status && !PURCHASE_STATUSES.has(status.toUpperCase())) {
    pushIssue(
      issues,
      row.number,
      'status',
      `invalid status: ${status}`,
      status,
    );
  }

  return issues;
}
