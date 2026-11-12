-- ADR 0009：测试任务中的用例记录自己的模块。已有的行取用例现在的模块。
ALTER TABLE "test_run_cases" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "test_run_cases" SET "module_id" = "test_cases"."module_id" FROM "test_cases" WHERE "test_cases"."id" = "test_run_cases"."case_id";
