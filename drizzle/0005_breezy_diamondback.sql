CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"section_id" text,
	"hypothesis" text NOT NULL,
	"query" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"raw_excerpt" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"relevance_score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sources_session_id_status_idx" ON "sources" USING btree ("session_id","status");