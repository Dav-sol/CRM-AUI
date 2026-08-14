import { Injectable } from '@nestjs/common';
import { MAX_FILE_SIZE_BYTES } from './imports.constants';

export type ImportFileFormat = 'xlsx' | 'csv';

const XLSX_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'application/vnd.ms-excel',
];

const CSV_MIME = ['text/csv', 'text/plain', 'application/octet-stream'];

const XLSX_MAGIC = Buffer.from('504b0304', 'hex');

@Injectable()
export class FileValidatorService {
  validateFormat(file: Express.Multer.File): ImportFileFormat {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }

    const originalName = file.originalname ?? '';
    const extension = originalName.split('.').pop()?.toLowerCase();

    if (extension === 'xlsx') {
      if (!XLSX_MIME.includes(file.mimetype)) {
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
      }
      const head = file.buffer.subarray(0, 4);
      if (head.length !== 4 || !head.equals(XLSX_MAGIC)) {
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
      }
      return 'xlsx';
    }

    if (extension === 'csv') {
      if (!CSV_MIME.includes(file.mimetype)) {
        throw new Error('UNSUPPORTED_MEDIA_TYPE');
      }
      return 'csv';
    }

    throw new Error('UNSUPPORTED_MEDIA_TYPE');
  }
}
