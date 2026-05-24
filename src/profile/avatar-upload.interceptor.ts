import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { catchError, throwError } from 'rxjs';

const AvatarImageInterceptor = FileInterceptor('image', {
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new BadRequestException('avatar must be a JPEG, PNG, or WebP image'), false);
      return;
    }
    cb(null, true);
  },
});

@Injectable()
export class AvatarUploadInterceptor extends AvatarImageInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    let stream;
    try {
      stream = await super.intercept(context, next);
    } catch (error) {
      throw this.mapMulterError(error);
    }

    return stream.pipe(
      catchError((error: unknown) => {
        return throwError(() => this.mapMulterError(error));
      }),
    );
  }

  private mapMulterError(error: unknown) {
    if (this.isMulterLimitFileSize(error) || this.isPayloadTooLarge(error)) {
      return new BadRequestException('avatar image must be 2 MB or smaller');
    }
    return error;
  }

  private isMulterLimitFileSize(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'LIMIT_FILE_SIZE';
  }

  private isPayloadTooLarge(error: unknown): boolean {
    return error instanceof HttpException && error.getStatus() === 413;
  }
}
