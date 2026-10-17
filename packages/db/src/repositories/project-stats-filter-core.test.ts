import type { SQL } from "drizzle-orm";
import { expect, it } from "vitest";

import {
	activeRunConditions,
	executionTrendConditions,
	lastExecutionConditions,
	latestResultConditions,
	runTrendConditions,
} from "./project-stats-filter-core";
import { NOW } from "./project-stats-fixtures";
import { renderConditions } from "./sql-render-fixtures";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const COUNTED_RUN = `"test_runs"."project_id" = $1 and "test_runs"."status" <> $2`;
const COUNTED_RUN_PARAMS = [PROJECT_ID, "voided"];

// 每一项读取测试任务的统计都排除已作废的测试任务（ADR 0004）
it.each<[string, () => SQL[], string, unknown[]]>([
	[
		"M3 进行中的测试任务：没有提交，也没有作废",
		() => activeRunConditions(PROJECT_ID),
		`(${COUNTED_RUN} and "test_runs"."submitted_at" is null)`,
		COUNTED_RUN_PARAMS,
	],
	[
		"M4 执行覆盖率：生效用例在没有作废的测试任务中通过或失败的执行",
		() => lastExecutionConditions(PROJECT_ID),
		`(${COUNTED_RUN} and "test_cases"."status" = $3 and "test_run_cases"."result" in ($4, $5) and "test_run_cases"."executed_at" is not null)`,
		[...COUNTED_RUN_PARAMS, "active", "passed", "failed"],
	],
	[
		"M5 最新执行结果：生效用例在没有作废的测试任务中、过去 30 天内有结论的执行",
		() => latestResultConditions(PROJECT_ID, NOW),
		`(${COUNTED_RUN} and "test_cases"."status" = $3 and "test_run_cases"."result" <> $4 and "test_run_cases"."executed_at" >= $5)`,
		[...COUNTED_RUN_PARAMS, "active", "untested", "2026-09-13T12:00:00.000Z"],
	],
	[
		"M6 每周执行结果：没有作废的测试任务中、第一个区间开始后有结论的执行",
		() => executionTrendConditions(PROJECT_ID, NOW),
		`(${COUNTED_RUN} and "test_run_cases"."result" <> $3 and "test_run_cases"."executed_at" >= $4)`,
		[...COUNTED_RUN_PARAMS, "untested", "2026-07-21T12:00:00.000Z"],
	],
	[
		"M7 测试任务新建和完成趋势：第一个区间开始后新建或完成、没有作废的测试任务",
		() => runTrendConditions(PROJECT_ID, NOW),
		`(${COUNTED_RUN} and ("test_runs"."created_at" >= $3 or "test_runs"."completed_at" >= $4))`,
		[
			...COUNTED_RUN_PARAMS,
			"2026-07-21T12:00:00.000Z",
			"2026-07-21T12:00:00.000Z",
		],
	],
])("%s", (_name, build, sql, params) => {
	expect(renderConditions(build())).toEqual({ params, sql });
});
