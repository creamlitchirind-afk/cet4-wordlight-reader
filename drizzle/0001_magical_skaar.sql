CREATE TABLE `reading_answers` (
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`question_number` integer NOT NULL,
	`selected_option` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `document_id`, `question_number`)
);
