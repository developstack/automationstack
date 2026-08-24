CREATE TYPE "public"."test_run_attachment_kind" AS ENUM('screenshot', 'video', 'log', 'other');--> statement-breakpoint
CREATE TYPE "public"."test_run_case_result" AS ENUM('untested', 'passed', 'failed', 'blocked', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."test_run_status" AS ENUM('pending_review', 'ready', 'in_progress', 'completed', 'submitted');--> statement-breakpoint
CREATE TABLE "jira_configs" (
	"api_token_cipher" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_issue_type" text DEFAULT 'Bug' NOT NULL,
	"email" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"project_key" text NOT NULL,
	"site_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"webhook_secret" text,
	CONSTRAINT "jira_configs_project_id_uq" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_settings" (
	"auto_submit_after_completed_days" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_settings_auto_submit_days_range" CHECK ("project_settings"."auto_submit_after_completed_days" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "test_run_attachments" (
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"file_name" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "test_run_attachment_kind" DEFAULT 'screenshot' NOT NULL,
	"run_case_id" uuid NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_run_cases" (
	"assignee_id" uuid,
	"case_id" uuid NOT NULL,
	"case_version" integer,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"defect_key" text,
	"defect_status" text,
	"defect_title" text,
	"defect_url" text,
	"executed_at" timestamp with time zone,
	"executed_by" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result" "test_run_case_result" DEFAULT 'untested' NOT NULL,
	"run_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "test_run_cases_run_id_case_id_uq" UNIQUE("run_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "test_run_events" (
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_status" "test_run_status",
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text,
	"run_id" uuid NOT NULL,
	"to_status" "test_run_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"started_at" timestamp with time zone,
	"status" "test_run_status" DEFAULT 'pending_review' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_runs_submitted_consistency" CHECK (("test_runs"."status" = 'submitted') = ("test_runs"."submitted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "jira_configs" ADD CONSTRAINT "jira_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_configs" ADD CONSTRAINT "jira_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_attachments" ADD CONSTRAINT "test_run_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_attachments" ADD CONSTRAINT "test_run_attachments_run_case_id_test_run_cases_id_fk" FOREIGN KEY ("run_case_id") REFERENCES "public"."test_run_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_events" ADD CONSTRAINT "test_run_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_run_events" ADD CONSTRAINT "test_run_events_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_settings_project_id_uq" ON "project_settings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_run_attachments_run_case_id_idx" ON "test_run_attachments" USING btree ("run_case_id");--> statement-breakpoint
CREATE INDEX "test_run_cases_run_id_result_idx" ON "test_run_cases" USING btree ("run_id","result");--> statement-breakpoint
CREATE INDEX "test_run_cases_case_id_executed_at_desc_idx" ON "test_run_cases" USING btree ("case_id","executed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "test_run_events_run_id_created_at_desc_idx" ON "test_run_events" USING btree ("run_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "test_runs_project_id_status_idx" ON "test_runs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "test_runs_project_id_created_at_desc_idx" ON "test_runs" USING btree ("project_id","created_at" DESC NULLS LAST);
