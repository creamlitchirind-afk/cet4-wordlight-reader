CREATE TABLE `exclusion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`option` text NOT NULL,
	`excluded` integer NOT NULL,
	`reason` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `option_exclusions` (
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`option` text NOT NULL,
	`excluded` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `document_id`, `question_number`, `option`)
);
