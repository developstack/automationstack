CREATE TYPE "public"."ai_proposal_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ai_session_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('P0', 'P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('draft', 'active', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."case_type" AS ENUM('functional', 'interface', 'performance', 'security', 'compatibility', 'other');--> statement-breakpoint
CREATE TABLE "ai_case_proposals" (
	"accepted_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal" jsonb NOT NULL,
	"session_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "ai_proposal_status" DEFAULT 'proposed' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_sessions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"module_id" uuid,
	"project_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"status" "ai_session_status" DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"project_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_versions" (
	"case_id" uuid NOT NULL,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_by" text,
	"snapshot" jsonb NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "case_versions_case_id_version_uq" UNIQUE("case_id","version")
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"case_type" "case_type" DEFAULT 'functional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_modified_by" text,
	"maintainer" text,
	"module_id" uuid NOT NULL,
	"name" text NOT NULL,
	"preconditions" text,
	"priority" "case_priority" DEFAULT 'P2' NOT NULL,
	"project_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_ref" text,
	"status" "case_status" DEFAULT 'draft' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_case_proposals" ADD CONSTRAINT "ai_case_proposals_accepted_case_id_test_cases_id_fk" FOREIGN KEY ("accepted_case_id") REFERENCES "public"."test_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_case_proposals" ADD CONSTRAINT "ai_case_proposals_session_id_ai_generation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_generation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_sessions" ADD CONSTRAINT "ai_generation_sessions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_sessions" ADD CONSTRAINT "ai_generation_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_parent_id_modules_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modules_project_id_idx" ON "modules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "modules_parent_id_sort_order_idx" ON "modules" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "case_versions_case_id_version_desc_idx" ON "case_versions" USING btree ("case_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "test_cases_module_id_sort_order_idx" ON "test_cases" USING btree ("module_id","sort_order");--> statement-breakpoint
CREATE INDEX "test_cases_project_id_status_idx" ON "test_cases" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_project_id_source_ref_uq" ON "test_cases" USING btree ("project_id","source_ref") WHERE source_ref IS NOT NULL;