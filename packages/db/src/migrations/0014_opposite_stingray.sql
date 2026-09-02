CREATE TYPE "public"."farm_artifact_kind" AS ENUM('har', 'console', 'screenshot', 'container_log', 'client_trace');--> statement-breakpoint
CREATE TYPE "public"."farm_session_protocol" AS ENUM('webdriver', 'cdp');--> statement-breakpoint
CREATE TYPE "public"."farm_session_status" AS ENUM('starting', 'running', 'finishing', 'completed', 'failed', 'timed_out', 'killed');--> statement-breakpoint
CREATE TABLE "farm_browsers" (
	"browser" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "farm_browsers_browser_version_uq" UNIQUE("browser","version")
);
--> statement-breakpoint
CREATE TABLE "farm_session_artifacts" (
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "farm_artifact_kind" NOT NULL,
	"meta" jsonb,
	"session_id" uuid NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_sessions" (
	"api_token_id" uuid,
	"browser" text NOT NULL,
	"container_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_ref" text,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY NOT NULL,
	"image" text NOT NULL,
	"kill_requested_at" timestamp with time zone,
	"label" text,
	"project_id" uuid NOT NULL,
	"protocol" "farm_session_protocol" NOT NULL,
	"requested_capabilities" jsonb,
	"started_at" timestamp with time zone,
	"status" "farm_session_status" DEFAULT 'starting' NOT NULL,
	"status_reason" text,
	"user_id" uuid,
	"version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm_session_artifacts" ADD CONSTRAINT "farm_session_artifacts_session_id_farm_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."farm_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD CONSTRAINT "farm_sessions_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD CONSTRAINT "farm_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_sessions" ADD CONSTRAINT "farm_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_browsers_single_default_uq" ON "farm_browsers" USING btree ("is_default") WHERE "farm_browsers"."is_default";--> statement-breakpoint
CREATE INDEX "farm_session_artifacts_session_id_idx" ON "farm_session_artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "farm_sessions_project_id_created_at_desc_idx" ON "farm_sessions" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "farm_sessions_status_idx" ON "farm_sessions" USING btree ("status");