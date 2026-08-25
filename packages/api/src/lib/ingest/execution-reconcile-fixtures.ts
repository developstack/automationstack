import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type { IngestExecutionResult } from "./execution-contract";

/**
 * 分桶那几份单测共用的造数（`execution-reconcile*.test.ts` 与
 * `execution-receipt-entries.test.ts`）。
 *
 * 单独成文件是因为那批断言被 300 行的门禁拆成了几个文件，而 `targetRow`
 * 这类造数每份都要用。逐份复制一遍的代价不是行数，是**它们会各自漂移**：
 * 某一份把 `status` 的默认值改成别的，另一份的断言仍然绿着，
 * 而两份测试从此在测两套不同的输入——`format-issues.ts` 抽出来的理由逐字适用。
 *
 * 这里只放**几份测试都要用**的东西；只有一份用得上的造数留在那一份里。
 */

export const CASE_A = "11111111-1111-4111-8111-111111111111";
export const CASE_B = "22222222-2222-4222-8222-222222222222";
export const RUN_ONE = "aaaaaaaa-1111-4111-8111-111111111111";
export const RUN_TWO = "bbbbbbbb-2222-4222-8222-222222222222";

export function passed(
	sourceRef: string,
	message?: string
): IngestExecutionResult {
	return { message: message ?? null, result: "passed", sourceRef };
}

/** 用例存在、但没有任何未提交任务收它：LEFT JOIN 的右半边全 null。 */
export function orphanRow(
	caseId: string,
	sourceRef: string
): AutomationTargetRow {
	return {
		caseId,
		runCaseId: null,
		runId: null,
		runName: null,
		runStatus: null,
		sourceRef,
	};
}

export function targetRow(options: {
	caseId: string;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	status?: AutomationTargetRow["runStatus"];
}): AutomationTargetRow {
	return {
		caseId: options.caseId,
		runCaseId: options.runCaseId,
		runId: options.runId,
		runName: options.runName,
		runStatus: options.status ?? "in_progress",
		sourceRef: options.sourceRef,
	};
}
