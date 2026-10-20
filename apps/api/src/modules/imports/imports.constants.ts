import { ImportStatus } from '@prisma/client';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const MAX_ROWS = 50_000;

export const BATCH_SIZE = 100;

export const ERROR_SAMPLE_LIMIT = 100;

export const ACTIVE_IMPORT_STATUSES: ImportStatus[] = [
  'PENDING',
  'VALIDATING',
  'PROCESSING',
];

export const FINAL_IMPORT_STATUSES: ImportStatus[] = [
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
];

export const MAX_INT = 2147483647;

export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fechas del ERP: SOLO fecha civil `YYYY-MM-DD`.
 *
 * Antes se aceptaban también marcas de tiempo con zona o sin zona. Con las
 * columnas migradas a `DATE`, aceptar `2026-01-31T18:00:00Z` truncaría la hora
 * en silencio y dejaría un día cuyo origen nadie puede reconstruir, así que el
 * contrato aprobado rechaza esos formatos en la frontera (PIT §4 RF-02, D-1).
 *
 * `isCivilDate` completa esta comprobación verificando que el día exista de
 * verdad: el regex por sí solo acepta `2026-02-30`.
 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const UPLOADS_DIR = 'uploads';
