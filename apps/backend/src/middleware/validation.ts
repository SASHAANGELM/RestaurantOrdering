import { z } from 'zod';
import { HttpError } from './errors';

// Return parsed values: Express 5 query/params objects must not be overwritten.
export function validateRequest<T extends z.ZodType>(schema: T, value: unknown, source: 'body' | 'query' | 'params' | 'headers'): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new HttpError({
    code: 'VALIDATION_ERROR', message: 'Request validation failed.',
    details: {
      issues: result.error.issues.map((issue) => ({
        path: [source, ...issue.path.map((part) => typeof part === 'number' ? part : String(part))],
        code: issue.code, message: issue.message
      }))
    }
  });
}
