import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ImportFileSizeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (
      exception instanceof Error &&
      exception.name === 'MulterError' &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      const ctx = host.switchToHttp();
      ctx
        .getResponse<Response>()
        .status(HttpStatus.PAYLOAD_TOO_LARGE)
        .json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'File exceeds the maximum size of 25 MB',
          },
        });
      return;
    }
    throw exception;
  }
}
