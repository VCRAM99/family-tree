ALTER TABLE "persons" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trees" ALTER COLUMN "visible_fields" SET DEFAULT '{}'::text[];--> statement-breakpoint
UPDATE "trees" SET "visible_fields" = '{}'::text[]
WHERE "visible_fields" = ARRAY['first_name','middle_name','last_name','preferred_name','sex','birth_date','death_date','birth_place','native_place','occupation','bio']::text[];
