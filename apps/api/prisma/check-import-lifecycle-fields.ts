// Verificación SIN escritura en la base de datos.
//
// Alimenta el parser real del importador con CSVs y comprueba qué columnas
// sobreviven al parseo. No crea clientes, compras ni nada: solo llama a
// `parseImportFile`, que es una función pura sobre un Buffer.
//
// Uso: pnpm --filter api exec tsx prisma/check-import-lifecycle-fields.ts
import {
  parseImportFile,
  validateRow,
} from '../src/modules/imports/imports.parser';

const BASE = [
  'invoiceNumber',
  'codcli',
  'code',
  'purchaseDate',
  'quantity',
  'value',
];
const VALOR = ['F-9001', 'C-001', 'BAT-01', '2026-06-15', '1', '450000'];

async function parse(cabecera: string[], valores: string[]) {
  const csv = `${cabecera.join(',')}\n${valores.join(',')}\n`;
  return parseImportFile(Buffer.from(csv, 'utf8'), 'csv', 'PURCHASES');
}

async function main(): Promise<void> {
  // 1) Fichero SIN columna de instalación: el contrato anterior.
  const sinColumna = await parse(BASE, VALOR);

  console.log('1) CSV sin columna de instalación (comportamiento previo)');
  console.log(`   incidencias: ${sinColumna.issues.length}`);
  console.log(`   purchaseDate:    ${sinColumna.rows[0].cells.purchaseDate}`);
  console.log(
    `   installationDate: ${
      'installationDate' in sinColumna.rows[0].cells
        ? sinColumna.rows[0].cells.installationDate
        : '(sin clave: el processor lo deja en null)'
    }`,
  );

  // 2) Fichero CON columna de instalación: el camino permanente.
  const conColumna = await parse(
    [...BASE, 'installationDate'],
    [...VALOR, '2026-06-20'],
  );

  console.log('\n2) CSV con columna installationDate');
  console.log(`   incidencias: ${conColumna.issues.length}`);
  console.log(`   purchaseDate:    ${conColumna.rows[0].cells.purchaseDate}`);
  console.log(
    `   installationDate: ${conColumna.rows[0].cells.installationDate}`,
  );

  // 3) Alias en español.
  const conAlias = await parse(
    [...BASE, 'fecha_instalacion'],
    [...VALOR, '2026-06-20'],
  );
  console.log('\n3) CSV con el alias fecha_instalacion');
  console.log(
    `   installationDate: ${conAlias.rows[0].cells.installationDate}`,
  );

  // 4) Fecha de instalación inválida.
  // `parseImportFile` solo parsea; la validación de campos vive en
  // `validateRow`, que el processor ejecuta por fila (imports.processor.ts:195).
  // Si hay error, la fila se salta entera y no se escribe: es el mismo contrato
  // que una purchaseDate o una quantity inválidas.
  const invalida = await parse(
    [...BASE, 'installationDate'],
    [...VALOR, '15/06/2026'],
  );
  const errores = validateRow('PURCHASES', invalida.rows[0]);
  console.log('\n4) CSV con installationDate inválida (15/06/2026)');
  console.log(`   errores de validateRow: ${errores.length}`);
  for (const i of errores) {
    console.log(`   fila ${i.row} campo ${i.field}: ${i.message}`);
  }
  console.log(
    '   => la fila NO se importa (mismo contrato que cualquier campo inválido)',
  );

  console.log(
    '\n--- Cómo se decide installationDate (processor.resolveInstallationDate) ---',
  );
  console.log(
    '   1. columna installationDate del fichero, si viene y es válida',
  );
  console.log(
    '   2. si el job se creó con installationFromPurchaseDate, copia purchaseDate',
  );
  console.log('   3. si no: null, y la compra no entra al lifecycle (gate G8)');
  console.log(
    '\n   La copia es exacta: nunca purchaseDate + N días, ni la fecha actual,',
  );
  console.log('   ni la de creación del registro.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
