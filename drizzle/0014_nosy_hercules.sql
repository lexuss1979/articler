ALTER TABLE "profiles" ADD COLUMN "light_research_sources" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "light_max_words" integer DEFAULT 800 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "draft_md_pre_review" text;