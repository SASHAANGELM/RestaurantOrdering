CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`menu_revision` integer DEFAULT 0 NOT NULL,
	`orders_revision` integer DEFAULT 0 NOT NULL,
	`demo_seed_mode` text,
	CONSTRAINT "app_state_singleton" CHECK("app_state"."id" = 1),
	CONSTRAINT "app_state_menu_revision" CHECK(typeof("app_state"."menu_revision") = 'integer' AND "app_state"."menu_revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "app_state_orders_revision" CHECK(typeof("app_state"."orders_revision") = 'integer' AND "app_state"."orders_revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "app_state_seed_mode" CHECK("app_state"."demo_seed_mode" IS NULL OR "app_state"."demo_seed_mode" IN ('small', 'large'))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_name" CHECK(length(trim("categories"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "categories_sort_order" CHECK(typeof("categories"."sort_order") = 'integer' AND "categories"."sort_order" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "categories_revision" CHECK(typeof("categories"."revision") = 'integer' AND "categories"."revision" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `categories_active_sort_idx` ON `categories` (`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE TABLE `checkout_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "checkout_quotes_revision" CHECK(typeof("checkout_quotes"."menu_revision") = 'integer' AND "checkout_quotes"."menu_revision" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "checkout_quotes_json" CHECK(json_valid("checkout_quotes"."snapshot_json")),
	CONSTRAINT "checkout_quotes_currency" CHECK("checkout_quotes"."currency" = 'USD'),
	CONSTRAINT "checkout_quotes_expiry" CHECK("checkout_quotes"."expires_at" > "checkout_quotes"."created_at")
);
--> statement-breakpoint
CREATE INDEX `checkout_quotes_expiry_idx` ON `checkout_quotes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`pricing_mode` text NOT NULL,
	`price_minor` integer,
	`available` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "menu_items_name" CHECK(length(trim("menu_items"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "menu_items_description" CHECK("menu_items"."description" IS NULL OR length("menu_items"."description") <= 2000),
	CONSTRAINT "menu_items_pricing" CHECK((
    "menu_items"."pricing_mode" = 'fixed' AND "menu_items"."price_minor" IS NOT NULL AND typeof("menu_items"."price_minor") = 'integer' AND "menu_items"."price_minor" BETWEEN 0 AND 1000000
  ) OR ("menu_items"."pricing_mode" = 'open' AND "menu_items"."price_minor" IS NULL)),
	CONSTRAINT "menu_items_available" CHECK(typeof("menu_items"."available") = 'integer' AND "menu_items"."available" BETWEEN 0 AND 1),
	CONSTRAINT "menu_items_revision" CHECK(typeof("menu_items"."revision") = 'integer' AND "menu_items"."revision" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `menu_items_category_active_idx` ON `menu_items` (`category_id`,`archived_at`,`name`,`id`);--> statement-breakpoint
CREATE INDEX `menu_items_active_idx` ON `menu_items` (`archived_at`,`name`,`id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_index` integer NOT NULL,
	`item_id` text NOT NULL,
	`category_id` text NOT NULL,
	`item_name` text NOT NULL,
	`category_name` text NOT NULL,
	`item_revision` integer NOT NULL,
	`pricing_mode` text NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_lines_index" CHECK(typeof("order_lines"."line_index") = 'integer' AND "order_lines"."line_index" BETWEEN 0 AND 99),
	CONSTRAINT "order_lines_item_name" CHECK(length(trim("order_lines"."item_name")) BETWEEN 1 AND 120),
	CONSTRAINT "order_lines_category_name" CHECK(length(trim("order_lines"."category_name")) BETWEEN 1 AND 120),
	CONSTRAINT "order_lines_item_revision" CHECK(typeof("order_lines"."item_revision") = 'integer' AND "order_lines"."item_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "order_lines_pricing" CHECK("order_lines"."pricing_mode" IN ('fixed', 'open')),
	CONSTRAINT "order_lines_unit_price" CHECK(typeof("order_lines"."unit_price_minor") = 'integer' AND "order_lines"."unit_price_minor" BETWEEN 0 AND 1000000),
	CONSTRAINT "order_lines_quantity" CHECK(typeof("order_lines"."quantity") = 'integer' AND "order_lines"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "order_lines_total" CHECK(typeof("order_lines"."line_total_minor") = 'integer' AND "order_lines"."line_total_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "order_lines_arithmetic" CHECK("order_lines"."line_total_minor" = "order_lines"."unit_price_minor" * "order_lines"."quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_lines_position_unique` ON `order_lines` (`order_id`,`line_index`);--> statement-breakpoint
CREATE INDEX `order_lines_item_idx` ON `order_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `order_lines_category_idx` ON `order_lines` (`category_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text DEFAULT 'placed' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `checkout_quotes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "orders_request_hash" CHECK(length("orders"."request_hash") = 64 AND "orders"."request_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "orders_status" CHECK("orders"."status" IN ('placed', 'preparing', 'ready', 'completed', 'cancelled')),
	CONSTRAINT "orders_subtotal" CHECK(typeof("orders"."subtotal_minor") = 'integer' AND "orders"."subtotal_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "orders_discount" CHECK(typeof("orders"."discount_minor") = 'integer' AND "orders"."discount_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "orders_total" CHECK(typeof("orders"."total_minor") = 'integer' AND "orders"."total_minor" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "orders_totals" CHECK("orders"."discount_minor" <= "orders"."subtotal_minor" AND "orders"."total_minor" = "orders"."subtotal_minor" - "orders"."discount_minor"),
	CONSTRAINT "orders_currency" CHECK("orders"."currency" = 'USD'),
	CONSTRAINT "orders_revision" CHECK(typeof("orders"."revision") = 'integer' AND "orders"."revision" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_quote_unique` ON `orders` (`quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`,`id`);