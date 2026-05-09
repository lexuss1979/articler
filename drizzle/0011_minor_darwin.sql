CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"monthly_cap_usd" numeric(12, 6),
	"session_cap_usd" numeric(12, 6),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;