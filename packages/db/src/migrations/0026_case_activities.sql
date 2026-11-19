CREATE TYPE "public"."case_activity_action" AS ENUM('created', 'updated', 'deleted');--> statement-breakpoint
CREATE TABLE "case_activities" (
	"action" "case_activity_action" NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"case_id" uuid NOT NULL,
	"case_name" text NOT NULL,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_versions" ADD COLUMN "saved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_activities_project_id_created_at_desc_idx" ON "case_activities" USING btree ("project_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "case_versions" ADD CONSTRAINT "case_versions_saved_by_id_users_id_fk" FOREIGN KEY ("saved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- 已有的版本：保存人的用户 id 按用户名补填（用户名唯一）。对不上的保存人保持为空。
UPDATE "case_versions" SET "saved_by_id" = "users"."id"
FROM "users"
WHERE "users"."username" = "case_versions"."saved_by" AND "case_versions"."saved_by_id" IS NULL;--> statement-breakpoint
-- 已有的版本写入操作记录：版本 1 是新建，其他是修改。已经删除的用例没有版本，所以没有记录。
INSERT INTO "case_activities" ("action", "actor_id", "actor_name", "case_id", "case_name", "change_note", "created_at", "module_id", "project_id", "version")
SELECT
	CASE WHEN "case_versions"."version" = 1 THEN 'created' ELSE 'updated' END::"case_activity_action",
	"case_versions"."saved_by_id",
	"case_versions"."saved_by",
	"case_versions"."case_id",
	COALESCE("case_versions"."snapshot"->>'name', "test_cases"."name"),
	"case_versions"."change_note",
	"case_versions"."created_at",
	COALESCE(("case_versions"."snapshot"->>'moduleId')::uuid, "test_cases"."module_id"),
	"test_cases"."project_id",
	"case_versions"."version"
FROM "case_versions"
INNER JOIN "test_cases" ON "test_cases"."id" = "case_versions"."case_id";
