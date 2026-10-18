import type { ClientError } from '../../core/api-client';

export function setupErrorMessage(error: ClientError): string {
  const body = error.body;
  if (body?.code === 'REVISION_CONFLICT') {
    return `Another edit changed this ${body.details.entityType} from revision ${body.details.expectedRevision} to ${body.details.currentRevision}. Your input is retained. Copy any changes you want to keep, then reload latest values and review before saving again.`;
  }
  if (body?.code === 'VALIDATION_ERROR') {
    return body.details.issues.map((issue) => `${issue.path.join('.') || 'Form'}: ${issue.message}`).join(' ');
  }
  return error.message;
}
