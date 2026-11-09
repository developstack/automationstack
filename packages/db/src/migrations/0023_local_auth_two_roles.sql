-- ADR 0008：只使用本地登录，平台角色只有管理员和普通用户，项目内没有角色。
-- 原来的项目管理员改为管理员。Casdoor 账号保留为本地账号，它们没有密码，管理员重置密码后才能登录。
UPDATE "users" SET "role" = 'admin' WHERE "role" = 'project_admin';--> statement-breakpoint
DROP TABLE "auth_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'::text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "project_members" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "auth_source";--> statement-breakpoint
DROP TYPE "public"."auth_provider";--> statement-breakpoint
DROP TYPE "public"."project_role";--> statement-breakpoint
DROP TYPE "public"."auth_source";