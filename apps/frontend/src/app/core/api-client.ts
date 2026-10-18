import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, defer, map, type Observable, throwError, timeout } from 'rxjs';
import { ZodError, type ZodType } from 'zod';
import {
  apiErrorSchema, categoriesResponseSchema, categoryMutationResponseSchema, confirmOrderSchema,
  createCategorySchema, createItemSchema, createQuoteSchema, idempotencyKeySchema, idSchema,
  itemMutationResponseSchema, itemsResponseSchema, menuItemsQuerySchema, orderResponseSchema,
  ordersQuerySchema, ordersResponseSchema, quoteResponseSchema, resolveItemsRequestSchema,
  resolveItemsResponseSchema, setupCategoriesQuerySchema, setupItemsQuerySchema, syncStateSchema,
  updateCategorySchema, updateItemSchema, updateOrderStatusSchema,
  type ApiErrorBody, type ConfirmOrder, type CreateCategory, type CreateItem, type CreateQuote,
  type MenuItemsQuery, type OrdersQuery, type ResolveItemsRequest, type SetupItemsQuery,
  type UpdateCategory, type UpdateItem, type UpdateOrderStatus
} from '@restaurant-ordering/contracts';

export class ClientError extends Error {
  constructor(
    message: string,
    readonly kind: 'api' | 'network' | 'invalid-response' | 'invalid-request',
    readonly status = 0,
    readonly body?: ApiErrorBody
  ) { super(message); }
}

export function clientError(error: unknown): ClientError {
  if (error instanceof ClientError) return error;
  if (error instanceof ZodError) return new ClientError('Check the request fields and try again.', 'invalid-request');
  if (error instanceof HttpErrorResponse) {
    const parsed = apiErrorSchema.safeParse(error.error);
    if (parsed.success) return new ClientError(parsed.data.error.message, 'api', error.status, parsed.data.error);
    return new ClientError(error.status === 0
      ? 'Cannot reach the server. Your displayed content is retained. Try again when connected.'
      : 'The server could not complete this request. Try again.', 'network', error.status);
  }
  return new ClientError('The request could not be completed. Try again.', 'network');
}

/** All browser HTTP uses the frontend origin and shared runtime response contracts. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  private request<T>(method: string, path: string, schema: ZodType<T>, options: {
    body?: unknown; params?: Record<string, string | number | boolean | undefined>; headers?: Record<string, string>;
  } = {}): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) params = params.set(key, value);
    }
    return this.http.request<unknown>(method, `/api${path}`, {
      ...options, params
    }).pipe(timeout(10_000), map((data) => {
      const result = schema.safeParse(data);
      if (!result.success) throw new ClientError('The server returned an invalid response. Try refreshing.', 'invalid-response');
      return result.data;
    }), catchError((error: unknown) => throwError(() => clientError(error))));
  }

  private send<T>(makeRequest: () => Observable<T>): Observable<T> {
    return defer(makeRequest).pipe(catchError((error: unknown) => throwError(() => clientError(error))));
  }

  sync() { return this.request('GET', '/sync', syncStateSchema); }
  categories() { return this.request('GET', '/menu/categories', categoriesResponseSchema); }
  setupCategories(includeArchived = false) {
    return this.send(() => this.request('GET', '/setup/categories', categoriesResponseSchema,
      { params: setupCategoriesQuerySchema.parse({ includeArchived }) }));
  }
  items(query: MenuItemsQuery) {
    return this.send(() => this.request('GET', '/menu/items', itemsResponseSchema, { params: menuItemsQuerySchema.parse(query) }));
  }
  setupItems(query: SetupItemsQuery) {
    return this.send(() => this.request('GET', '/setup/items', itemsResponseSchema, { params: setupItemsQuerySchema.parse(query) }));
  }
  resolveItems(body: ResolveItemsRequest) {
    return this.send(() => this.request('POST', '/menu/resolve', resolveItemsResponseSchema, { body: resolveItemsRequestSchema.parse(body) }));
  }
  createCategory(body: CreateCategory) {
    return this.send(() => this.request('POST', '/setup/categories', categoryMutationResponseSchema, { body: createCategorySchema.parse(body) }));
  }
  updateCategory(id: string, body: UpdateCategory) {
    return this.send(() => this.request('PATCH', `/setup/categories/${idSchema.parse(id)}`, categoryMutationResponseSchema, { body: updateCategorySchema.parse(body) }));
  }
  createItem(body: CreateItem) {
    return this.send(() => this.request('POST', '/setup/items', itemMutationResponseSchema, { body: createItemSchema.parse(body) }));
  }
  updateItem(id: string, body: UpdateItem) {
    return this.send(() => this.request('PATCH', `/setup/items/${idSchema.parse(id)}`, itemMutationResponseSchema, { body: updateItemSchema.parse(body) }));
  }
  quote(body: CreateQuote) {
    return this.send(() => this.request('POST', '/checkout/quotes', quoteResponseSchema, { body: createQuoteSchema.parse(body) }));
  }
  confirm(body: ConfirmOrder, key: string) {
    return this.send(() => this.request('POST', '/orders', orderResponseSchema, {
      body: confirmOrderSchema.parse(body), headers: { 'Idempotency-Key': idempotencyKeySchema.parse(key) }
    }));
  }
  orderByRequest(key: string) {
    return this.send(() => this.request('GET', `/orders/by-request/${idempotencyKeySchema.parse(key)}`, orderResponseSchema));
  }
  orders(query: OrdersQuery) {
    return this.send(() => this.request('GET', '/orders', ordersResponseSchema, { params: ordersQuerySchema.parse(query) }));
  }
  order(id: string) { return this.send(() => this.request('GET', `/orders/${idSchema.parse(id)}`, orderResponseSchema)); }
  updateOrderStatus(id: string, body: UpdateOrderStatus) {
    return this.send(() => this.request('PATCH', `/orders/${idSchema.parse(id)}/status`, orderResponseSchema, { body: updateOrderStatusSchema.parse(body) }));
  }
}
