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

export const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export const UPLOADS_DIR = 'uploads';
