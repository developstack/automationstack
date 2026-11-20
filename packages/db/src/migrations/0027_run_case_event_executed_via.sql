ALTER TABLE "test_run_case_events" ADD COLUMN "executed_via" "test_run_executed_via";--> statement-breakpoint
CREATE INDEX "test_run_case_events_created_at_idx" ON "test_run_case_events" USING btree ("created_at");--> statement-breakpoint
-- 已有的判定：测试任务用例最后一次是自动化回写、并且时间相同的判定记为自动化，其他判定记为手动。
-- 更早的自动化判定被后来的判定覆盖后无法区分，记为手动。改回未测的记录保持为空。
UPDATE "test_run_case_events" SET "executed_via" = CASE
	WHEN "test_run_cases"."executed_via" = 'automation' AND "test_run_cases"."executed_at" = "test_run_case_events"."created_at"
	THEN 'automation'::"test_run_executed_via"
	ELSE 'manual'::"test_run_executed_via"
END
FROM "test_run_cases"
WHERE "test_run_cases"."id" = "test_run_case_events"."run_case_id"
	AND "test_run_case_events"."to_result" <> 'untested';
