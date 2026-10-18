import { Router } from 'express';
import { z } from 'zod';
import {
  createCategorySchema, createItemSchema, idSchema, menuItemsQuerySchema, resolveItemsRequestSchema,
  setupCategoriesQuerySchema, setupItemsQuerySchema, updateCategorySchema, updateItemSchema
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { validateRequest } from '../../middleware/validation';
import { listCategories, listItems, resolveItems } from './queries';
import { createMenuService } from './service';

const idParamsSchema = z.strictObject({ id: idSchema });
const emptyQuerySchema = z.strictObject({});

export function createMenuRouter(connection: DatabaseConnection) {
  const router = Router();
  const service = createMenuService(connection);
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/menu/categories', (request, response) => {
    validateRequest(emptyQuerySchema, request.query, 'query');
    response.json(listCategories(connection));
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
    response.status(201).json(service.createCategory(validateRequest(createCategorySchema, request.body, 'body')).response);
  });
  router.patch('/setup/categories/:id', (request, response) => {
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    response.json(service.updateCategory(id, validateRequest(updateCategorySchema, request.body, 'body')).response);
  });
  router.post('/setup/items', (request, response) => {
    response.status(201).json(service.createItem(validateRequest(createItemSchema, request.body, 'body')).response);
  });
  router.patch('/setup/items/:id', (request, response) => {
    const { id } = validateRequest(idParamsSchema, request.params, 'params');
    response.json(service.updateItem(id, validateRequest(updateItemSchema, request.body, 'body')).response);
  });
  return router;
}
