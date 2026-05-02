CREATE TABLE "claim_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"verdict_id" integer NOT NULL,
	"source_id" integer,
	"url" text NOT NULL,
	"snippet" text NOT NULL,
	"supports" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_verdicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_id" integer NOT NULL,
	"verdict" text NOT NULL,
	"justification" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"span" jsonb NOT NULL,
	"span_hash" text NOT NULL,
	"claim_text" text NOT NULL,
	"claim_type" text NOT NULL,
	"check_worthiness" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "critique_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"critic_id" text NOT NULL,
	"severity" text NOT NULL,
	"span" jsonb NOT NULL,
	"problem" text NOT NULL,
	"suggested_change" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "critique_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"kind" text NOT NULL,
	"draft_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_verdict_id_claim_verdicts_id_fk" FOREIGN KEY ("verdict_id") REFERENCES "public"."claim_verdicts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verdicts" ADD CONSTRAINT "claim_verdicts_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_round_id_critique_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."critique_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_findings" ADD CONSTRAINT "critique_findings_round_id_critique_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."critique_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critique_rounds" ADD CONSTRAINT "critique_rounds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_verdicts_claim_id_id_idx" ON "claim_verdicts" USING btree ("claim_id","id");--> statement-breakpoint
CREATE INDEX "claims_session_id_span_hash_idx" ON "claims" USING btree ("session_id","span_hash");--> statement-breakpoint
CREATE INDEX "critique_findings_round_id_id_idx" ON "critique_findings" USING btree ("round_id","id");--> statement-breakpoint
CREATE INDEX "critique_rounds_session_id_id_idx" ON "critique_rounds" USING btree ("session_id","id");