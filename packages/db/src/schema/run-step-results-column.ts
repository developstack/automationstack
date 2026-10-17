import { customType } from "drizzle-orm/pg-core";

import type { RunCaseStepResult, TestRunStepResult } from "./test-run-enums";

/**
 * test_run_cases.step_results 中一个步骤结果的存储形式。
 * 实际结果的文字存在 comment 键中：#78 之前这个键保存失败原因和阻塞原因，
 * #78 把它们改称实际结果，但没有改存储键，所以已有数据不需要迁移。
 * 用 SQL 直接写这一列的代码（test-run-step-results-sql.ts）也必须用 comment 键。
 */
export interface StoredRunCaseStepResult {
	comment: string | null;
	result: TestRunStepResult;
	stepId: string;
}

export function toStoredStepResults(
	items: readonly RunCaseStepResult[]
): StoredRunCaseStepResult[] {
	return items.map((item) => ({
		comment: item.actualResult,
		result: item.result,
		stepId: item.stepId,
	}));
}

function isStoredStepResult(item: unknown): item is StoredRunCaseStepResult {
	return (
		typeof item === "object" &&
		item !== null &&
		"stepId" in item &&
		"result" in item
	);
}

function parseDriverValue(value: unknown): unknown {
	if (typeof value !== "string") {
		return value;
	}
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

/** 驱动通常返回已解析的 jsonb，有的驱动返回文字。无法解析或形状不对的值读作空列表或跳过。 */
export function fromStoredStepResults(value: unknown): RunCaseStepResult[] {
	const parsed = parseDriverValue(value);
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed.filter(isStoredStepResult).map((item) => ({
		actualResult: item.comment ?? null,
		result: item.result,
		stepId: item.stepId,
	}));
}

/** jsonb 列：读写时在代码的 actualResult 和存储的 comment 键之间转换。 */
export const runStepResultsJsonb = customType<{
	data: RunCaseStepResult[];
	driverData: unknown;
}>({
	dataType: () => "jsonb",
	fromDriver: fromStoredStepResults,
	toDriver: (items) => JSON.stringify(toStoredStepResults(items)),
});
