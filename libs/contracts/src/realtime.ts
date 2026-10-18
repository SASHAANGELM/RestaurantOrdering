import * as z from 'zod';
import { entityRevisionSchema, idSchema, revisionSchema, syncStateSchema } from './common';

export const menuChangedSchema = z.strictObject({
  eventId: idSchema,
  menuRevision: revisionSchema,
  entityType: z.enum(['category', 'item']),
  entityId: idSchema,
  change: z.enum(['created', 'updated', 'archived'])
});
export const ordersChangedSchema = z.strictObject({
  eventId: idSchema,
  ordersRevision: revisionSchema,
  orderId: idSchema,
  orderRevision: entityRevisionSchema,
  change: z.enum(['created', 'status-changed'])
});
export const serverEventSchemas = {
  'sync.state': syncStateSchema,
  'menu.changed': menuChangedSchema,
  'orders.changed': ordersChangedSchema
} as const;

export type MenuChanged = z.infer<typeof menuChangedSchema>;
export type OrdersChanged = z.infer<typeof ordersChangedSchema>;
export type ServerToClientEvents = {
  [Event in keyof typeof serverEventSchemas]: (payload: z.infer<(typeof serverEventSchemas)[Event]>) => void;
};
// No custom client domain events. Socket.IO transport lifecycle events are built in.
export type ClientToServerEvents = Record<never, never>;
