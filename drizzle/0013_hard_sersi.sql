CREATE TABLE "profile_assertions" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"assertion" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'session' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_assertions" ADD CONSTRAINT "profile_assertions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_assertions_profile_id_key_idx" ON "profile_assertions" USING btree ("profile_id","key");