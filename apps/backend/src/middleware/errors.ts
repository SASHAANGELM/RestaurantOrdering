import type { ErrorRequestHandler } from 'express';
import { API_ERROR_STATUS, type ApiErrorBody } from '@restaurant-ordering/contracts';

type WithoutRequestId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type ErrorPayload = WithoutRequestId<ApiErrorBody>;

export class HttpError extends Error {
  constructor(readonly payload: ErrorPayload, options?: ErrorOptions) {
    super(payload.message, options);
    this.name = 'HttpError';
  }
}

export function unavailableError(cause?: unknown) {
  return new HttpError({
    code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please retry.', details: { retryAfterMs: 1000 }
  }, { cause });
}

function isSqliteLock(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && typeof current.code === 'string' && /^SQLITE_(BUSY|LOCKED)(_|$)/.test(current.code)) return true;
    current = current.cause;
  }
  return false;
}

export type ErrorReporter = (entry: { event: 'request.failed'; requestId: string; error: unknown }) => void;

export function errorHandler(reportError: ErrorReporter): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    const requestId = response.locals['requestId'] as string;
    let payload: ErrorPayload;
    if (error instanceof HttpError) payload = error.payload;
    else if (isSqliteLock(error)) payload = unavailableError().payload;
    else if (error instanceof URIError) {
      payload = {
        code: 'VALIDATION_ERROR', message: 'Invalid request path.',
        details: { issues: [{ path: ['params'], code: 'invalid_encoding', message: 'Use valid URL encoding.' }] }
      };
    }
    else if (error instanceof Error && 'type' in error &&
      ['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid']
        .includes(String(error.type))) {
      payload = {
        code: 'VALIDATION_ERROR', message: 'Invalid JSON request body.',
        details: { issues: [{ path: ['body'], code: String(error.type), message: 'Send valid JSON within the configured body limit.' }] }
      };
    } else {
      payload = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
    }
    if (payload.code === 'INTERNAL_ERROR' || payload.code === 'SERVICE_UNAVAILABLE') {
      reportError({ event: 'request.failed', requestId, error });
    }
    if (payload.code === 'SERVICE_UNAVAILABLE') response.setHeader('Retry-After', Math.ceil(payload.details.retryAfterMs / 1000));
    response.status(API_ERROR_STATUS[payload.code]).json({ error: { ...payload, requestId } });
  };
}
