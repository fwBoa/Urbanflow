import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter.
 *
 * Logging/redaction tiers (driven by NODE_ENV):
 *  - development / staging : return the full error message to the client and
 *    log the full stack, so a release candidate can be diagnosed.
 *  - production             : redact the internal message (return a generic
 *    "Internal server error") and log the full detail server-side only, so
 *    internals never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Always log the full detail server-side for operators.
    const message = isHttp
      ? (exception.getResponse() as { message?: unknown }).message ??
        exception.message
      : (exception as Error)?.message ?? String(exception);
    const stack = (exception as Error)?.stack;
    this.logger.error(
      `${request.method} ${request.url} → ${status}: ${message}`,
      stack,
    );

    // Client-facing payload: full detail outside production, redacted in prod.
    const clientMessage =
      !this.isProd || isHttp ? message : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}