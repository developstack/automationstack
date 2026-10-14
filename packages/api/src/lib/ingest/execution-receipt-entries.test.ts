import { expect, test } from "vitest";
import {
	buildCaseIdBySourceRef,
	buildGroupOutOfScopeEntries,
	buildSkippedManualEntries,
	buildWrittenToEntry,
} from "./execution-receipt-entries";
import {
	CASE_A,
	CASE_B,
	RUN_ONE,
	regressionRow,
} from "./execution-reconcile-fixtures";
import type { AutomationWriteGroup } from "./execution-write-plan";

const GROUP: AutomationWriteGroup = {
	items: [
		{ comment: null, result: "passed", runCaseId: "rc-a", sourceRef: "A" },
		{ comment: null, result: "failed", runCaseId: "rc-b", sourceRef: "B" },
	],
	runId: RUN_ONE,
	runName: "v2.3 回归",
};

test("skippedManual 必须带 runName，否则对账单自相矛盾", () => {
	expect(buildSkippedManualEntries(GROUP, ["rc-b"])).toEqual([
		{ reason: "已有人工结论", runName: "v2.3 回归", sourceRef: "B" },
	]);
	expect(buildSkippedManualEntries(GROUP, [])).toEqual([]);
	expect(buildSkippedManualEntries(GROUP, ["rc-unknown"])).toEqual([]);
});

test("整组被拒时逐条落进 outOfScope，caseId 从解析行回填", () => {
	const caseIdBySourceRef = buildCaseIdBySourceRef([
		regressionRow({ runCaseId: "rc-a", sourceRef: "A" }),
		regressionRow({ caseId: CASE_B, runCaseId: "rc-b", sourceRef: "B" }),
	]);
	const entry = { reason: "任务刚被提交", runName: "v2.3 回归" };
	expect(
		buildGroupOutOfScopeEntries(GROUP, caseIdBySourceRef, "任务刚被提交")
	).toEqual([
		{ ...entry, caseId: CASE_A, sourceRef: "A" },
		{ ...entry, caseId: CASE_B, sourceRef: "B" },
	]);
});

test("一条都没写进去的任务不进 writtenTo（D34 的三行要数得清）", () => {
	expect(buildWrittenToEntry(GROUP, 0)).toBeNull();
	expect(buildWrittenToEntry(GROUP, 12)).toEqual({
		runId: RUN_ONE,
		runName: "v2.3 回归",
		updated: 12,
	});
});
