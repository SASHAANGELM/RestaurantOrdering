import { Router } from 'express';
import { z } from 'zod';
import {
  confirmOrderSchema, idempotencyKeySchema, idSchema, ordersQuerySchema, updateOrderStatusSchema
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { validateRequest } from '../../middleware/validation';
import { getOrder, getOrderByRequest, listOrders } from './queries';
import { createOrderService } from './service';
import type { Notifications } from '../realtime/server';

const idParamsSchema = z.strictObject({ id: idSchema });
const keyParamsSchema = z.strictObject({ idempotencyKey: idempotencyKeySchema });
const keyHeaderSchema = z.strictObject({ 'idempotency-key': idempotencyKeySchema });
const emptyQuerySchema = z.strictObject({});

export function createOrdersRouter(connection: DatabaseConnection, notifications?: Notifications) {
  const router = Router();
  const service = createOrderService(connection);
  router.use('/orders', (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/orders', (request, response) => {
    const headers = validateRequest(keyHeaderSchema, { 'idempotency-key': request.headers['idempotency-key'] }, 'headers');
    const result = service.confirm(validateRequest(confirmOrderSchema, request.body, 'body'), headers['idempotency-key']);
    if (result.notification) notifications?.ordersChanged(result.notification);
    response.status(result.replayed ? 200 : 201).json(result.response);
  });
  router.get('/orders/by-request/:idempotencyKey', (request, response) => {
    validateRequest(emptyQuerySchema, request.query, 'query');
    const { idempotencyKey } = validateRequest(keyParamsSchema, request.params, 'params');
    response.json(getOrderByRequest(connection, idempotencyKey));
  });
  router.get('/orders', (request, response) => {
    response.json(listOrders(connection, validateRequest(ordersQuerySchema, request.query, 'query')));
  });
  router.get('/orders/:id', (request, response) => {
    validateRequest(emptyQuerySchema, request.query, 'query');
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    response.json(getOrder(connection, id));
  });
  router.patch('/orders/:id/status', (request, response) => {
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    const result = service.updateStatus(id, validateRequest(updateOrderStatusSchema, request.body, 'body'));
    if (result.notification) notifications?.ordersChanged(result.notification);
    response.json(result.response);
  });
  return router;
}
