import { Router } from 'express';
import { createQuoteSchema } from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { validateRequest } from '../../middleware/validation';
import { createCheckoutService } from './service';

export function createCheckoutRouter(connection: DatabaseConnection) {
  const router = Router();
  const service = createCheckoutService(connection);
  router.post('/checkout/quotes', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(201).json(service.createQuote(validateRequest(createQuoteSchema, request.body, 'body')));
  });
  return router;
}
