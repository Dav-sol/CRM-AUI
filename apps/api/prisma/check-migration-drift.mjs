/**
 * Comprobación de deriva entre las migraciones del repositorio y las que la
 * base de datos tiene registradas. SOLO LECTURA: no escribe, no migra y no
 * modifica nada.
 *
 * Qué detecta:
 *  1. Migración aplicada en la BD cuyo `checksum` no coincide con el archivo
 *     del disco → la migración fue EDITADA después de aplicarse. Es la deriva
 *     más grave: la BD y el repositorio ya no describen el mismo esquema.
 *  2. Migración aplicada en la BD que no está en el disco → el entorno lleva
 *     cambios que el repositorio no conoce.
 *  3. Migración en disco que NO figura en `MIGRATIONS.sha256` → no está
 *     aprobada (no versionada o pendiente de revisión). `prisma migrate
 *     deploy` la aplicaría igualmente.
 *
 * Qué NO hace: no resuelve la deriva, no aplica nada y no da por buena una
 * migración solo por estar en disco. Ante cualquier deriva falla.
 *
 * Uso:
 *   node prisma/check-migration-drift.mjs            # informa y sale con 1 si hay deriva
 *   node prisma/check-migration-drift.mjs --allow-pending  # no falla por migraciones pendientes
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, 'migrations');
const MANIFEST = join(MIGRATIONS_DIR, 'MIGRATIONS.sha256');
const allowPending = process.argv.includes('--allow-pending');

const fail = (msg) => {
  console.error(`FALLO: ${msg}`);
  process.exitCode = 1;
};

/** sha256 de un archivo. */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Lee el manifiesto de migraciones aprobadas. */
function readManifest() {
  if (!existsSync(MANIFEST)) {
    fail(`no existe el manifiesto de migraciones aprobadas: ${MANIFEST}`);
    return new Map();
  }
  const entries = new Map();
  for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([0-9a-f]{64})\s+(.+)$/.exec(trimmed);
    if (!match) {
      fail(`línea con formato inválido en el manifiesto: ${trimmed}`);
      continue;
    }
    entries.set(match[2], match[1]);
  }
  return entries;
}

/** Migraciones presentes en disco (carpetas con migration.sql). */
function migrationsOnDisk() {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail(`no existe el directorio de migraciones: ${MIGRATIONS_DIR}`);
    return new Map();
  }
  const found = new Map();
  for (const entry of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(MIGRATIONS_DIR, entry.name, 'migration.sql');
    if (!existsSync(file)) continue;
    found.set(`${entry.name}/migration.sql`, sha256(file));
  }
  return found;
}

async function readAppliedMigrations() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return await prisma.$queryRaw`
      SELECT migration_name AS "migrationName",
             checksum,
             finished_at AS "finishedAt",
             rolled_back_at AS "rolledBackAt"
      FROM _prisma_migrations
      ORDER BY started_at ASC
    `;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const manifest = readManifest();
  const onDisk = migrationsOnDisk();

  // --- 1. Migraciones en disco que no están aprobadas ---
  const notApproved = [...onDisk.keys()].filter((rel) => !manifest.has(rel));
  for (const rel of notApproved.sort()) {
    fail(
      `migración en disco que NO figura en MIGRATIONS.sha256 (no aprobada): ${rel}. ` +
        '`prisma migrate deploy` la aplicaría igualmente. Revísala, versiona la ' +
        'carpeta completa en Git y añade su sha256 al manifiesto.',
    );
  }

  // --- 2. Migraciones aprobadas cuyo archivo cambió o falta ---
  for (const [rel, checksum] of [...manifest.entries()].sort()) {
    if (!onDisk.has(rel)) {
      fail(`migración aprobada pero ausente del disco: ${rel}`);
      continue;
    }
    if (onDisk.get(rel) !== checksum) {
      fail(
        `migración aprobada con contenido distinto al del manifiesto: ${rel}. ` +
          'Editar una migración ya aprobada es deriva: el entorno y el ' +
          'repositorio describen esquemas distintos.',
      );
    }
  }

  // --- 3. Deriva con la base de datos ---
  let applied = [];
  try {
    applied = await readAppliedMigrations();
  } catch (error) {
    fail(
      `no se pudo leer _prisma_migrations (¿base de datos accesible?): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  const appliedByName = new Map();
  for (const row of applied) {
    if (row.rolledBackAt) continue;
    appliedByName.set(row.migrationName, row);
  }

  for (const [name, row] of appliedByName) {
    const rel = `${name}/migration.sql`;
    if (!onDisk.has(rel)) {
      fail(
        `migración APLICADA en la base de datos pero ausente del repositorio: ${name}. ` +
          'El entorno lleva cambios que el repositorio no conoce.',
      );
      continue;
    }
    if (row.checksum && onDisk.get(rel) !== row.checksum) {
      fail(
        `migración APLICADA con checksum distinto al del archivo: ${name}. ` +
          `BD=${row.checksum} disco=${onDisk.get(rel)}. ` +
          'La migración fue editada después de aplicarse.',
      );
    }
  }

  const pending = [...onDisk.keys()]
    .map((rel) => rel.split('/')[0])
    .filter((name) => !appliedByName.has(name));

  if (pending.length > 0) {
    const message = `migraciones pendientes de aplicar: ${pending.sort().join(', ')}`;
    if (allowPending) {
      console.log(`AVISO: ${message}`);
    } else {
      fail(`${message}. (use --allow-pending si su aplicación está autorizada)`);
    }
  }

  if (process.exitCode) {
    console.error('');
    console.error('La deriva NO se resuelve automáticamente: repárala y vuelve a ejecutar.');
    return;
  }
  console.log(
    `OK: ${onDisk.size} migraciones en disco, ${appliedByName.size} aplicadas, ` +
      'sin deriva respecto del manifiesto ni de la base de datos.',
  );
}

main().catch((error) => {
  console.error(`FALLO inesperado: ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
