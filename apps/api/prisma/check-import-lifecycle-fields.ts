// Verificación SIN escritura en la base de datos.
//
// Alimenta el parser real del importador con un CSV que trae TODAS las
// columnas que el Lifecycle P0 necesita (spec 025 §1 y §3) y comprueba
// cuáles sobreviven al parseo. No crea clientes, compras ni nada: solo
// llama a `parseImportFile`, que es una función pura sobre un Buffer.
//
// Uso: pnpm --filter api exec tsx prisma/check-import-lifecycle-fields.ts
import { parseImportFile } from '../src/modules/imports/imports.parser';

/** Columnas que el Lifecycle P0 necesita. */
const CABECERA = [
  'codcli',
  'name',
  'telecli',
  'invoiceNumber',
  'code',
  'producto',
  'purchaseDate',
  'quantity',
  'value',
  'warrantyMonths',
  // Las dos formas en las que un fichero real podría traer la instalación:
  'installationDate',
  'fechaInstalacion',
];

const FILA = [
  'C-001',
  'Cliente Prueba',
  '3001234567',
  'FV-9001',
  'BAT-AGM-001',
  'Bateria AGM',
  '2026-08-01',
  '1',
  '450000',
  '12',
  '2026-08-03',
  '2026-08-03',
];

const csv = `${CABECERA.join(',')}\n${FILA.join(',')}\n`;

async function main(): Promise<void> {
  const result = await parseImportFile(
    Buffer.from(csv, 'utf8'),
    'csv',
    'PURCHASES',
  );

  const fila = result.rows[0];

  console.log(`Columnas del CSV: ${CABECERA.length}`);
  console.log(`Filas parseadas:  ${result.rows.length}`);
  console.log(`Incidencias: ${result.issues.length}`);
  for (const e of result.issues) {
    console.log(`  error fila ${e.row}: ${e.message}`);
  }

  console.log('\nColumnas que SOBREVIVIERON al parseo:');
  for (const key of Object.keys(fila.cells).sort()) {
    console.log(`  ${key.padEnd(18)} = ${fila.cells[key]}`);
  }

  // El parser renombra columnas por HEADER_ALIASES, así que "telecli" acaba
  // como "phone". Para noermarkar una columna como descartada cuando solo le
  // cambió el nombre, se compara contra la clave esperada.
  const CLAVE_ESPERADA: Record<string, string> = {
    codcli: 'codcli',
    name: 'name',
    telecli: 'phone',
    invoiceNumber: 'invoiceNumber',
    code: 'code',
    producto: 'name',
    purchaseDate: 'purchaseDate',
    quantity: 'quantity',
    value: 'value',
    warrantyMonths: 'warrantyMonths',
    installationDate: 'installationDate',
    fechaInstalacion: 'installationDate',
  };

  console.log('\nColumnas DESCARTADAS por el parser:');
  const descartadas: string[] = [];
  for (const h of CABECERA) {
    const clave = CLAVE_ESPERADA[h];
    const valor = clave in fila.cells ? fila.cells[clave] : undefined;
    if (valor === undefined) {
      descartadas.push(h);
      console.log(`  ${h}  (sin clave "${clave}" en la fila parseada)`);
    }
  }
  if (descartadas.length === 0) console.log('  (ninguna)');

  const conInstalacion = Object.keys(fila.cells).filter((k) =>
    /instala/i.test(k),
  );

  console.log('\n--- VEREDICTO sobre installationDate (spec 025 §1) ---');
  console.log(
    `  recognition en purchases_installation_date: ` +
      (conInstalacion.length ? conInstalacion.join(', ') : 'NINGUNA'),
  );
  console.log(
    `  compra aceptada por el importador: ${result.issues.length === 0 ? 'sí' : 'con errores'}`,
  );
  console.log(
    '  => La compra se importa, pero installationDate se pierde en silencio:',
  );
  console.log(
    '     automations.service.ts:301 lo lee y devuelve awaiting_installation.',
  );

  console.log('\n--- warrantyMonths (spec 025 §3) ---');
  console.log(`  recognition: ${fila.cells.warrantyMonths ?? 'NINGUNA'}`);

  console.log(
    '\n--- campos del Lifecycle P0 sin ninguna columna en el importador ---',
  );
  console.log('  installationDate (instalación)');
  console.log(
    '  vehículo / placa / serial: no existen en el schema (spec 025 §7 dice que no bloquea P0)',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
