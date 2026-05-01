CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"style" text NOT NULL,
	"audience" text NOT NULL,
	"target_volume_min" integer NOT NULL,
	"target_volume_max" integer NOT NULL,
	"markup_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extra_prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;