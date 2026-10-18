import { Router } from 'express';
import { z } from 'zod';
import {
  createCategorySchema, createItemSchema, idSchema, menuCategoriesQuerySchema, menuItemsQuerySchema, resolveItemsRequestSchema,
  setupCategoriesQuerySchema, setupItemsQuerySchema, updateCategorySchema, updateItemSchema
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { validateRequest } from '../../middleware/validation';
import { listCategories, listItems, resolveItems } from './queries';
import { createMenuService } from './service';
import type { Notifications } from '../realtime/server';

const idParamsSchema = z.strictObject({ id: idSchema });

export function createMenuRouter(connection: DatabaseConnection, notifications?: Notifications) {
  const router = Router();
  const service = createMenuService(connection);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/menu/categories', (request, response) => {
    const query = validateRequest(menuCategoriesQuerySchema, request.query, 'query');
    response.json(listCategories(connection, false, query.search ?? ''));
  });
  router.get('/setup/categories', (request, response) => {
    const query = validateRequest(setupCategoriesQuerySchema, request.query, 'query');
    response.json(listCategories(connection, query.includeArchived));
  });
  router.get('/menu/items', (request, response) => {
    response.json(listItems(connection, validateRequest(menuItemsQuerySchema, request.query, 'query')));
  });
  router.get('/setup/items', (request, response) => {
    response.json(listItems(connection, validateRequest(setupItemsQuerySchema, request.query, 'query'), true));
  });
  router.post('/menu/resolve', (request, response) => {
    const body = validateRequest(resolveItemsRequestSchema, request.body, 'body');
    response.json(resolveItems(connection, body.itemIds));
  });
  router.post('/setup/categories', (request, response) => {
    const result = service.createCategory(validateRequest(createCategorySchema, request.body, 'body'));
    if (result.notification) notifications?.menuChanged(result.notification);
    response.status(201).json(result.response);
  });
  router.patch('/setup/categories/:id', (request, response) => {
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    const result = service.updateCategory(id, validateRequest(updateCategorySchema, request.body, 'body'));
    if (result.notification) notifications?.menuChanged(result.notification);
    response.json(result.response);
  });
  router.post('/setup/items', (request, response) => {
    const result = service.createItem(validateRequest(createItemSchema, request.body, 'body'));
    if (result.notification) notifications?.menuChanged(result.notification);
    response.status(201).json(result.response);
  });
  router.patch('/setup/items/:id', (request, response) => {
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    const result = service.updateItem(id, validateRequest(updateItemSchema, request.body, 'body'));
    if (result.notification) notifications?.menuChanged(result.notification);
    response.json(result.response);
  });
  return router;
}
