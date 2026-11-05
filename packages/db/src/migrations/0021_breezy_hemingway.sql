DROP TABLE "jira_configs" CASCADE;--> statement-breakpoint
ALTER TABLE "test_run_cases" DROP COLUMN "defect_key";--> statement-breakpoint
ALTER TABLE "test_run_cases" DROP COLUMN "defect_status";--> statement-breakpoint
ALTER TABLE "test_run_cases" DROP COLUMN "defect_title";--> statement-breakpoint
ALTER TABLE "test_run_cases" DROP COLUMN "defect_url";