CREATE TYPE "public"."test_run_executed_via" AS ENUM('manual', 'automation');--> statement-breakpoint
CREATE TABLE "automation_executions" (
	"branch" text,
	"ci_url" text,
	"commit_sha" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"project_id" uuid NOT NULL,
	"reported_by" uuid,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"updated_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "automation_executions_project_id_idempotency_key_uq" UNIQUE("project_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "test_run_attachments" ADD COLUMN "uploaded_via" "test_run_executed_via";--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD COLUMN "executed_via" "test_run_executed_via";--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD COLUMN "last_automation_execution_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_executions_project_id_created_at_desc_idx" ON "automation_executions" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_last_automation_execution_id_automation_executions_id_fk" FOREIGN KEY ("last_automation_execution_id") REFERENCES "public"."automation_executions"("id") ON DELETE set null ON UPDATE no action;