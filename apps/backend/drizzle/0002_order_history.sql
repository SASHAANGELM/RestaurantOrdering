CREATE TABLE `order_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_status_events_status" CHECK("order_status_events"."status" IN ('placed', 'preparing', 'ready', 'completed', 'cancelled')),
	CONSTRAINT "order_status_events_revision" CHECK(typeof("order_status_events"."revision") = 'integer' AND "order_status_events"."revision" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_status_events_revision_unique` ON `order_status_events` (`order_id`,`revision`);--> statement-breakpoint
ALTER TABLE `order_lines` ADD `image_url` text;
--> statement-breakpoint
INSERT INTO order_status_events (id, order_id, revision, status, changed_at)
SELECT id || ':placed', id, 1, 'placed', created_at FROM orders;
--> statement-breakpoint
INSERT INTO order_status_events (id, order_id, revision, status, changed_at)
SELECT id || ':latest', id, revision, status, updated_at FROM orders WHERE status != 'placed' AND revision > 1;
--> statement-breakpoint
UPDATE order_lines SET image_url = (SELECT image_url FROM menu_items WHERE menu_items.id = order_lines.item_id);
