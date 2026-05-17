import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttp ? exception.getResponse() : { message: 'Internal server error' };
    const body = typeof payload === 'string' ? { message: payload } : (payload as Record<string, unknown>);

    if (!isHttp) this.logger.error(`Unhandled: ${String(exception)}`, (exception as Error)?.stack);

    res.status(status).json({
      statusCode: status,
      message: body.message ?? 'Error',
      error: body.error ?? (isHttp ? exception.name : 'InternalServerError'),
      path: req.url,
    });
  }
}
