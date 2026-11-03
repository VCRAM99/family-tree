CREATE TYPE "public"."date_precision" AS ENUM('exact', 'month', 'year', 'approx');--> statement-breakpoint
CREATE TYPE "public"."parent_link_kind" AS ENUM('biological', 'adoptive', 'step', 'foster');--> statement-breakpoint
CREATE TYPE "public"."person_sex" AS ENUM('male', 'female', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('new_person', 'contact_update', 'correction');--> statement-breakpoint
CREATE TYPE "public"."tree_admin_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tree_admin_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."tree_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TYPE "public"."union_status" AS ENUM('married', 'divorced', 'widowed', 'partner');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"kind" "parent_link_kind" DEFAULT 'biological' NOT NULL,
	"union_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_links_parent_child_uidx" UNIQUE("parent_id","child_id"),
	CONSTRAINT "parent_links_not_self" CHECK ("parent_links"."parent_id" <> "parent_links"."child_id")
);
--> statement-breakpoint
CREATE TABLE "person_photos" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_photos_mime_webp" CHECK ("person_photos"."mime" = 'image/webp'),
	CONSTRAINT "person_photos_max_bytes" CHECK ("person_photos"."size_bytes" <= 524288 and "person_photos"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text,
	"preferred_name" text,
	"birth_surname" text,
	"sex" "person_sex" DEFAULT 'unknown' NOT NULL,
	"birth_date" date,
	"birth_date_precision" date_precision,
	"death_date" date,
	"death_date_precision" date_precision,
	"is_deceased" boolean DEFAULT false NOT NULL,
	"birth_place" text,
	"native_place" text,
	"current_location" text,
	"occupation" text,
	"bio" text,
	"has_photo" boolean DEFAULT false NOT NULL,
	"phone_whatsapp" text,
	"email" text,
	"instagram" text,
	"facebook" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_id_tree_uidx" UNIQUE("id","tree_id"),
	CONSTRAINT "persons_birth_precision_pair" CHECK (("persons"."birth_date" is null and "persons"."birth_date_precision" is null) or ("persons"."birth_date" is not null and "persons"."birth_date_precision" is not null)),
	CONSTRAINT "persons_death_precision_pair" CHECK (("persons"."death_date" is null and "persons"."death_date_precision" is null) or ("persons"."death_date" is not null and "persons"."death_date_precision" is not null))
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"submitted_by" text NOT NULL,
	"type" "suggestion_type" NOT NULL,
	"target_person_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tree_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"user_id" text,
	"invited_email" text NOT NULL,
	"role" "tree_admin_role" NOT NULL,
	"status" "tree_admin_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_admins_tree_user_uidx" UNIQUE("tree_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" "tree_visibility" DEFAULT 'private' NOT NULL,
	"share_code" char(8) NOT NULL,
	"public_tag" text,
	"allow_suggestions" boolean DEFAULT false NOT NULL,
	"socials_enabled" boolean DEFAULT false NOT NULL,
	"photos_enabled" boolean DEFAULT false NOT NULL,
	"hide_living_details" boolean DEFAULT true NOT NULL,
	"visible_fields" text[] DEFAULT ARRAY['first_name','middle_name','last_name','preferred_name','sex','birth_date','death_date','birth_place','native_place','occupation','bio']::text[] NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"custom_field_defs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trees_share_code_unique" UNIQUE("share_code"),
	CONSTRAINT "trees_share_code_alphabet" CHECK ("trees"."share_code" ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$'),
	CONSTRAINT "trees_public_tag_required_when_public" CHECK ("trees"."visibility" <> 'public' OR "trees"."public_tag" IS NOT NULL),
	CONSTRAINT "trees_public_tag_format" CHECK ("trees"."public_tag" IS NULL OR "trees"."public_tag" ~ '^[a-z0-9-]{3,40}$'),
	CONSTRAINT "trees_theme_known" CHECK ("trees"."theme" in ('system', 'light', 'dark', 'papyrus', 'dark-paper', 'sepia-archive', 'blueprint', 'sage-botanical'))
);
--> statement-breakpoint
CREATE TABLE "unions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"status" "union_status" DEFAULT 'married' NOT NULL,
	"start_date" date,
	"end_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unions_id_tree_uidx" UNIQUE("id","tree_id"),
	CONSTRAINT "unions_distinct_people" CHECK ("unions"."person_a_id" <> "unions"."person_b_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewer_identities" (
	"user_id" text NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viewer_identities_user_id_tree_id_pk" PRIMARY KEY("user_id","tree_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_union_id_unions_id_fk" FOREIGN KEY ("union_id") REFERENCES "public"."unions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_parent_same_tree_fk" FOREIGN KEY ("parent_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_links" ADD CONSTRAINT "parent_links_child_same_tree_fk" FOREIGN KEY ("child_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_photos" ADD CONSTRAINT "person_photos_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_target_same_tree_fk" FOREIGN KEY ("target_person_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_admins" ADD CONSTRAINT "tree_admins_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_admins" ADD CONSTRAINT "tree_admins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trees" ADD CONSTRAINT "trees_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_person_a_same_tree_fk" FOREIGN KEY ("person_a_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unions" ADD CONSTRAINT "unions_person_b_same_tree_fk" FOREIGN KEY ("person_b_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_identities" ADD CONSTRAINT "viewer_identities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_identities" ADD CONSTRAINT "viewer_identities_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_identities" ADD CONSTRAINT "viewer_identities_person_same_tree_fk" FOREIGN KEY ("person_id","tree_id") REFERENCES "public"."persons"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parent_links_tree_id_idx" ON "parent_links" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "parent_links_parent_id_idx" ON "parent_links" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "parent_links_child_id_idx" ON "parent_links" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "persons_tree_id_idx" ON "persons" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suggestions_tree_id_idx" ON "suggestions" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "suggestions_target_person_id_idx" ON "suggestions" USING btree ("target_person_id");--> statement-breakpoint
CREATE INDEX "tree_admins_tree_id_idx" ON "tree_admins" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "tree_admins_user_id_idx" ON "tree_admins" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tree_admins_tree_email_uidx" ON "tree_admins" USING btree ("tree_id",lower("invited_email"));--> statement-breakpoint
CREATE INDEX "trees_owner_id_idx" ON "trees" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trees_public_tag_lower_uidx" ON "trees" USING btree (lower("public_tag"));--> statement-breakpoint
CREATE INDEX "unions_tree_id_idx" ON "unions" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "unions_person_a_id_idx" ON "unions" USING btree ("person_a_id");--> statement-breakpoint
CREATE INDEX "unions_person_b_id_idx" ON "unions" USING btree ("person_b_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "viewer_identities_tree_id_idx" ON "viewer_identities" USING btree ("tree_id");