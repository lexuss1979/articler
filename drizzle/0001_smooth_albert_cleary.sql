CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"user_id" integer,
	"stage" text NOT NULL,
	"task" text NOT NULL,
	"model_class" text NOT NULL,
	"model_name" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"latency_ms" integer NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"payload_path" text
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;