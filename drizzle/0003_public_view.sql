ALTER TABLE "trees" ADD COLUMN "notify_suggestions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "lookup_buckets" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
