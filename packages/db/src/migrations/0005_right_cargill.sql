CREATE TABLE "test_run_case_events" (
	"actor_id" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_result" "test_run_case_result" NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_case_id" uuid NOT NULL,
	"to_result" "test_run_case_result" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_run_case_events" ADD CONSTRAINT "test_run_case_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_case_events" ADD CONSTRAINT "test_run_case_events_run_case_id_test_run_cases_id_fk" FOREIGN KEY ("run_case_id") REFERENCES "public"."test_run_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_run_case_events_run_case_id_created_at_desc_idx" ON "test_run_case_events" USING btree ("run_case_id","created_at" DESC NULLS LAST);