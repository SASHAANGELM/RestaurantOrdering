import * as z from 'zod';
import {
  descriptionSchema, entityRevisionSchema, idSchema, MAX_CART_LINES, MAX_PAGE_SIZE, nameSchema,
  paginationQueryShape, paginationShape, revisionSchema, timestampSchema, unitPriceMinorSchema
} from './common';

const entityShape = {
  id: idSchema,
  revision: entityRevisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  archivedAt: timestampSchema.nullable()
};
const categoryFields = { availableCount: z.int().nonnegative().optional(), name: nameSchema, sortOrder: z.int() };
export const categorySchema = z.strictObject({ ...entityShape, ...categoryFields });
export const createCategorySchema = z.strictObject({ name: nameSchema, sortOrder: z.int().default(0) });
export const updateCategorySchema = z.strictObject({
  expectedRevision: entityRevisionSchema,
  name: nameSchema.optional(),
  sortOrder: z.int().optional(),
  archived: z.literal(true).optional()
}).refine((value) => value.name !== undefined || value.sortOrder !== undefined || value.archived !== undefined,
  'Provide at least one change.');

export const itemImageSchema = z.union([
  z.string().regex(/^\/(?:api\/)?images\/[a-z0-9-]+\.(jpg|webp|png)$/),
  z.url({ protocol: /^https$/ }).max(2048)
]);

const itemFields = {
  imageUrl: itemImageSchema.optional(),
  categoryId: idSchema,
  name: nameSchema,
  description: descriptionSchema.optional(),
  available: z.boolean()
};
const fixedPricing = { pricingMode: z.literal('fixed'), priceMinor: unitPriceMinorSchema };
const openPricing = { pricingMode: z.literal('open'), priceMinor: z.null() };
export const menuItemSchema = z.discriminatedUnion('pricingMode', [
  z.strictObject({ ...entityShape, ...itemFields, ...fixedPricing }),
  z.strictObject({ ...entityShape, ...itemFields, ...openPricing })
]);
export const createItemSchema = z.discriminatedUnion('pricingMode', [
  z.strictObject({ ...itemFields, ...fixedPricing }),
  z.strictObject({ ...itemFields, pricingMode: z.literal('open') })
]);
const itemChanges = {
  imageUrl: itemImageSchema.nullable().optional(),
  expectedRevision: entityRevisionSchema,
  categoryId: idSchema.optional(),
  name: nameSchema.optional(),
  description: descriptionSchema.nullable().optional(),
  available: z.boolean().optional(),
  archived: z.literal(true).optional()
};
// Send the complete pricing pair when changing price/mode. Omit both for other edits.
export const updateItemSchema = z.union([
  z.strictObject({ ...itemChanges, ...fixedPricing }),
  z.strictObject({ ...itemChanges, pricingMode: z.literal('open') }),
  z.strictObject(itemChanges)
]).refine((value) => Object.entries(value).some(([key, field]) => key !== 'expectedRevision' && field !== undefined),
  'Provide at least one change.');

export const menuCategoriesQuerySchema = z.strictObject({ search: z.string().trim().max(120).optional() });

export const menuItemsQuerySchema = z.strictObject({
  ...paginationQueryShape,
  categoryId: idSchema.optional(),
  search: z.string().trim().max(120).optional()
});
export const setupCategoriesQuerySchema = z.strictObject({
  includeArchived: z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]).default(false)
});
export const setupItemsQuerySchema = menuItemsQuerySchema.extend(setupCategoriesQuerySchema.shape);
export const categoriesResponseSchema = z.strictObject({ categories: z.array(categorySchema), menuRevision: revisionSchema, menuUpdatedAt: timestampSchema.nullable().optional() });
export const itemsResponseSchema = z.strictObject({
  items: z.array(menuItemSchema).max(MAX_PAGE_SIZE), ...paginationShape, menuRevision: revisionSchema, menuUpdatedAt: timestampSchema.nullable().optional()
}).refine((value) => value.items.length <= value.pageSize && value.items.length <= value.total,
  'Items must fit the requested page and total.');
export const categoryMutationResponseSchema = z.strictObject({ category: categorySchema, menuRevision: revisionSchema });
export const itemMutationResponseSchema = z.strictObject({ item: menuItemSchema, menuRevision: revisionSchema });
export const resolveItemsRequestSchema = z.strictObject({
  itemIds: z.array(idSchema).min(1).max(MAX_CART_LINES)
    .refine((ids) => new Set(ids).size === ids.length, 'Item IDs must be unique.')
});
export const resolvedItemSchema = z.discriminatedUnion('state', [
  z.strictObject({ itemId: idSchema, state: z.literal('missing') }),
  z.strictObject({
    itemId: idSchema,
    state: z.enum(['available', 'unavailable', 'archived', 'category-archived']),
    item: menuItemSchema,
    category: categorySchema
  }).refine((value) => value.itemId === value.item.id && value.category.id === value.item.categoryId,
    'Resolved IDs must match the item and category.')
]);
export const resolveItemsResponseSchema = z.strictObject({
  items: z.array(resolvedItemSchema).max(MAX_CART_LINES), menuRevision: revisionSchema, menuUpdatedAt: timestampSchema.nullable().optional()
});

export type Category = z.infer<typeof categorySchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
export type CreateItem = z.infer<typeof createItemSchema>;
export type UpdateItem = z.infer<typeof updateItemSchema>;
export type MenuItemsQuery = z.infer<typeof menuItemsQuerySchema>;
export type SetupItemsQuery = z.infer<typeof setupItemsQuerySchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type ItemsResponse = z.infer<typeof itemsResponseSchema>;
export type CategoryMutationResponse = z.infer<typeof categoryMutationResponseSchema>;
export type ItemMutationResponse = z.infer<typeof itemMutationResponseSchema>;
export type ResolveItemsRequest = z.infer<typeof resolveItemsRequestSchema>;
export type ResolvedItem = z.infer<typeof resolvedItemSchema>;
export type ResolveItemsResponse = z.infer<typeof resolveItemsResponseSchema>;
