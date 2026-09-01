CREATE TABLE `password_reset_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`jellyfin_user_id` text,
	`expires_at` integer NOT NULL,
	`processing_at` integer,
	`processing_token` text,
	`completed_at` integer,
	`email_sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
