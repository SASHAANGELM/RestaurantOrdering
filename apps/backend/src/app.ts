import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import { z } from 'zod';
import type { DatabaseConnection } from './db/connection';
import { errorHandler, HttpError, unavailableError, type ErrorReporter } from './middleware/errors';
import { createCheckoutRouter } from './modules/checkout/router';
import { createMenuRouter } from './modules/menu/router';
import { createOrdersRouter } from './modules/orders/router';
import type { Notifications } from './modules/realtime/server';
import { readSyncState } from './modules/realtime/sync';
import { validateRequest } from './middleware/validation';

export interface AppOptions {
  connection: DatabaseConnection;
  jsonBodyLimitBytes: number;
  isShuttingDown?: () => boolean;
  reportError?: ErrorReporter;
  registerRoutes?: (app: Express) => void;
  notifications?: Notifications;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.locals['requestId'] = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  });
  app.use('/api/health', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health/live', (_request, response) => { response.json({ status: 'live' }); });
  app.get('/api/health/ready', (_request, response) => {
    if (options.isShuttingDown?.()) throw unavailableError();
    try {
      const state = options.connection.sqlite.prepare('SELECT id FROM app_state WHERE id = 1').get();
      const migration = options.connection.sqlite.prepare('SELECT id FROM __drizzle_migrations LIMIT 1').get();
      if (!state || !migration) throw new Error('Database initialization is incomplete.');
    } catch (error) {
      throw unavailableError(error);
    }
    response.json({ status: 'ready' });
  });
  app.use((_request, _response, next) => { next(options.isShuttingDown?.() ? unavailableError() : undefined); });
  app.use(express.json({ limit: options.jsonBodyLimitBytes, strict: true, inflate: false }));
  app.get('/api', (_request, response) => { response.json({ name: 'Restaurant Ordering API' }); });
  app.get('/api/sync', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    validateRequest(z.strictObject({}), request.query, 'query');
    response.json(readSyncState(options.connection));
  });
  app.use('/api', createMenuRouter(options.connection, options.notifications));
  app.use('/api', createCheckoutRouter(options.connection));
  app.use('/api', createOrdersRouter(options.connection, options.notifications));
  options.registerRoutes?.(app);
  app.use((_request, response) => {
    throw new HttpError({
      code: 'NOT_FOUND', message: 'The requested endpoint was not found.',
      details: { resourceType: 'request', resourceId: response.locals['requestId'] as string }
    });
  });
  app.use(errorHandler(options.reportError ?? ((entry) => console.error(entry))));
  return app;
}
