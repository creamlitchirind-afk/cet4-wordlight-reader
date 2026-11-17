CREATE TABLE `answer_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`previous_option` text DEFAULT '' NOT NULL,
	`selected_option` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized` text NOT NULL,
	`action` text NOT NULL,
	`from_stage` integer NOT NULL,
	`to_stage` integer NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`document_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `unknown_words` ADD `stage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `unknown_words` ADD `last_advanced_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `unknown_words` ADD `recall_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `unknown_words` ADD `forget_count` integer DEFAULT 0 NOT NULL;