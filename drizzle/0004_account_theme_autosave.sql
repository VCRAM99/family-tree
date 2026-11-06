ALTER TABLE "trees" ADD COLUMN "autosave" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_theme_known" CHECK ("theme" in ('system', 'light', 'dark', 'papyrus', 'dark-paper', 'sepia-archive', 'blueprint', 'sage-botanical'));
