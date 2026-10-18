import { sql, type SQLWrapper } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { OrderStatus, PricingMode, QuoteSnapshot } from '@restaurant-ordering/contracts';

// Freeze persistence limits with each schema version; contract changes need a migration.
const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const integerBetween = (column: SQLWrapper, minimum: number, maximum = MAX_SAFE_INTEGER) =>
  sql`typeof(${column}) = 'integer' AND ${column} BETWEEN ${sql.raw(String(minimum))} AND ${sql.raw(String(maximum))}`;
const entityFields = () => ({
  id: text('id').primaryKey().notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at')
});

export const appState = sqliteTable('app_state', {
  id: integer('id').primaryKey().notNull().default(1),
  menuRevision: integer('menu_revision').notNull().default(0),
  ordersRevision: integer('orders_revision').notNull().default(0),
  demoSeedMode: text('demo_seed_mode', { enum: ['small', 'large'] })
}, (table) => [
  check('app_state_singleton', sql`${table.id} = 1`),
  check('app_state_menu_revision', integerBetween(table.menuRevision, 0)),
  check('app_state_orders_revision', integerBetween(table.ordersRevision, 0)),
  check('app_state_seed_mode', sql`${table.demoSeedMode} IS NULL OR ${table.demoSeedMode} IN ('small', 'large')`)
]);

export const categories = sqliteTable('categories', {
  ...entityFields(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
}, (table) => [
  check('categories_name', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
  check('categories_sort_order', integerBetween(table.sortOrder, -MAX_SAFE_INTEGER)),
  check('categories_revision', integerBetween(table.revision, 1)),
  index('categories_active_sort_idx').on(table.archivedAt, table.sortOrder, table.id)
]);

export const menuItems = sqliteTable('menu_items', {
  ...entityFields(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  pricingMode: text('pricing_mode').$type<PricingMode>().notNull(),
  priceMinor: integer('price_minor'),
  available: integer('available', { mode: 'boolean' }).notNull().default(true)
}, (table) => [
  check('menu_items_name', sql`length(trim(${table.name})) BETWEEN 1 AND 120`),
  check('menu_items_description', sql`${table.description} IS NULL OR length(${table.description}) <= 2000`),
  check('menu_items_pricing', sql`(
    ${table.pricingMode} = 'fixed' AND ${table.priceMinor} IS NOT NULL AND ${integerBetween(table.priceMinor, 0, 1_000_000)}
  ) OR (${table.pricingMode} = 'open' AND ${table.priceMinor} IS NULL)`),
  check('menu_items_available', integerBetween(table.available, 0, 1)),
  check('menu_items_revision', integerBetween(table.revision, 1)),
  index('menu_items_category_active_idx').on(table.categoryId, table.archivedAt, table.name, table.id),
  index('menu_items_active_idx').on(table.archivedAt, table.name, table.id)
]);

export const checkoutQuotes = sqliteTable('checkout_quotes', {
  id: text('id').primaryKey().notNull(),
  menuRevision: integer('menu_revision').notNull(),
  // The checkout service must validate this using quoteSnapshotSchema before insertion.
  snapshot: text('snapshot_json', { mode: 'json' }).$type<QuoteSnapshot>().notNull(),
  currency: text('currency').notNull().default('USD'),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull()
}, (table) => [
  check('checkout_quotes_revision', integerBetween(table.menuRevision, 0)),
  check('checkout_quotes_json', sql`json_valid(${table.snapshot})`),
  check('checkout_quotes_currency', sql`${table.currency} = 'USD'`),
  check('checkout_quotes_expiry', sql`${table.expiresAt} > ${table.createdAt}`),
  index('checkout_quotes_expiry_idx').on(table.expiresAt)
]);

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey().notNull(),
  quoteId: text('quote_id').notNull().references(() => checkoutQuotes.id, { onDelete: 'restrict' }),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  status: text('status').$type<OrderStatus>().notNull().default('placed'),
  subtotalMinor: integer('subtotal_minor').notNull(),
  discountMinor: integer('discount_minor').notNull(),
  totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull().default('USD'),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}, (table) => [
  uniqueIndex('orders_quote_unique').on(table.quoteId),
  uniqueIndex('orders_idempotency_key_unique').on(table.idempotencyKey),
  check('orders_request_hash', sql`length(${table.requestHash}) = 64 AND ${table.requestHash} NOT GLOB '*[^0-9a-f]*'`),
  check('orders_status', sql`${table.status} IN ('placed', 'preparing', 'ready', 'completed', 'cancelled')`),
  check('orders_subtotal', integerBetween(table.subtotalMinor, 0)),
  check('orders_discount', integerBetween(table.discountMinor, 0)),
  check('orders_total', integerBetween(table.totalMinor, 0)),
  check('orders_totals', sql`${table.discountMinor} <= ${table.subtotalMinor} AND ${table.totalMinor} = ${table.subtotalMinor} - ${table.discountMinor}`),
  check('orders_currency', sql`${table.currency} = 'USD'`),
  check('orders_revision', integerBetween(table.revision, 1)),
  index('orders_created_idx').on(table.createdAt, table.id),
  index('orders_status_created_idx').on(table.status, table.createdAt, table.id)
]);

export const orderLines = sqliteTable('order_lines', {
  id: text('id').primaryKey().notNull(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  lineIndex: integer('line_index').notNull(),
  itemId: text('item_id').notNull().references(() => menuItems.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  itemName: text('item_name').notNull(),
  categoryName: text('category_name').notNull(),
  itemRevision: integer('item_revision').notNull(),
  pricingMode: text('pricing_mode').$type<PricingMode>().notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotalMinor: integer('line_total_minor').notNull()
}, (table) => [
  uniqueIndex('order_lines_position_unique').on(table.orderId, table.lineIndex),
  index('order_lines_item_idx').on(table.itemId),
  index('order_lines_category_idx').on(table.categoryId),
  check('order_lines_index', integerBetween(table.lineIndex, 0, 99)),
  check('order_lines_item_name', sql`length(trim(${table.itemName})) BETWEEN 1 AND 120`),
  check('order_lines_category_name', sql`length(trim(${table.categoryName})) BETWEEN 1 AND 120`),
  check('order_lines_item_revision', integerBetween(table.itemRevision, 1)),
  check('order_lines_pricing', sql`${table.pricingMode} IN ('fixed', 'open')`),
  check('order_lines_unit_price', integerBetween(table.unitPriceMinor, 0, 1_000_000)),
  check('order_lines_quantity', integerBetween(table.quantity, 1, 99)),
  check('order_lines_total', integerBetween(table.lineTotalMinor, 0)),
  check('order_lines_arithmetic', sql`${table.lineTotalMinor} = ${table.unitPriceMinor} * ${table.quantity}`)
]);
