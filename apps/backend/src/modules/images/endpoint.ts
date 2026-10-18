import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from 'express';
import { HttpError } from '../../middleware/errors';

/** Flat image names only. Open the final component without following symlinks;
 * inspect and read the same descriptor, avoiding a stat/read race.
 */
export function imageEndpoint(directory: string): RequestHandler {
  return async (request, response, next) => {
    const missing = () => new HttpError({ code: 'NOT_FOUND', message: 'Image not found.',
      details: { resourceType: 'request', resourceId: response.locals['requestId'] as string } });
    const filename = request.params['filename'];
    if (typeof filename !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}\.(jpg|png|webp)$/.test(filename)) { next(missing()); return; }
    try {
      const root = await realpath(directory);
      const file = await open(join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!(await file.stat()).isFile()) { next(missing()); return; }
        const bytes = await file.readFile();
        const extension = filename.slice(filename.lastIndexOf('.') + 1);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.type(extension === 'jpg' ? 'image/jpeg' : `image/${extension}`).send(bytes);
      } finally { await file.close(); }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(String(error.code))) next(missing());
      else next(error);
    }
  };
}
