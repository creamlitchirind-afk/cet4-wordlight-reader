CREATE TABLE `reading_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`questions` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unknown_words` (
	`user_id` text NOT NULL,
	`normalized` text NOT NULL,
	`display` text NOT NULL,
	`click_count` integer DEFAULT 1 NOT NULL,
	`contexts` text DEFAULT '[]' NOT NULL,
	`document_ids` text DEFAULT '[]' NOT NULL,
	`first_clicked_at` integer NOT NULL,
	`last_clicked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `normalized`)
);
