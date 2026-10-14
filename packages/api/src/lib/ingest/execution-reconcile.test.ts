import { expect, test } from "vitest";
import { buildUnexplainedOutOfScopeEntries } from "./execution-reconcile";
import {
	CASE_A,
	CASE_B,
	orphanRow,
	passed,
	paymentRow,
	RUN_ONE,
	RUN_TWO,
	reconcile,
	regressionRow,
} from "./execution-reconcile-fixtures";

test("解析不到任何行的 sourceRef 进 unmatchedCases，且不带 caseId", () => {
	const reconciled = reconcile([], null, [passed("MISSING")]);
	expect(reconciled.groups).toEqual([]);
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.unmatchedCases).toEqual([
		{ reason: "项目里没有这个 sourceRef 的用例", sourceRef: "MISSING" },
	]);
});

const orphanReconciled = () =>
	reconcile([orphanRow(CASE_A, "ORPHAN")], null, [passed("ORPHAN")]);

test("用例存在但没有候选任务时先进 unexplained，等诊断后才落 outOfScope（D24 要 caseId）", () => {
	const reconciled = orphanReconciled();
	expect(reconciled.unmatchedCases).toEqual([]);
	expect(reconciled.groups).toEqual([]);
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.unexplained).toEqual([
		{ caseId: CASE_A, sourceRef: "ORPHAN" },
	]);
	expect(buildUnexplainedOutOfScopeEntries(reconciled.unexplained, [])).toEqual(
		[
			{
				caseId: CASE_A,
				reason: "不在任何未提交任务的范围内",
				runName: null,
				sourceRef: "ORPHAN",
			},
		]
	);
});

test("落空的原因是「收它的任务已提交」时，理由必须点名那个任务，不许退回那句假话", () => {
	const entries = buildUnexplainedOutOfScopeEntries(
		orphanReconciled().unexplained,
		[
			{
				runName: "v2.2 回归",
				sourceRef: "ORPHAN",
				submittedAt: new Date("2026-08-20T02:00:00Z"),
			},
		]
	);
	expect(entries).toHaveLength(1);
	expect(entries[0]?.caseId).toBe(CASE_A);
	expect(entries[0]?.runName).toBe("v2.2 回归");
	expect(entries[0]?.reason).toContain("v2.2 回归");
	expect(entries[0]?.reason).toContain("已提交并锁定");
	expect(entries[0]?.reason).toContain("新建测试任务");
	expect(entries[0]?.reason).not.toContain("不在任何未提交任务的范围内");
});

test("同一条 sourceRef 命中两个任务时按 runId 分成两组", () => {
	const reconciled = reconcile([regressionRow(), paymentRow()], null, [
		passed("SHARED", "  boom  "),
	]);
	const item = { comment: "boom", result: "passed", sourceRef: "SHARED" };
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.groups).toEqual([
		{
			items: [{ ...item, runCaseId: "rc-1" }],
			runId: RUN_ONE,
			runName: "v2.3 回归",
		},
		{
			items: [{ ...item, runCaseId: "rc-2" }],
			runId: RUN_TWO,
			runName: "支付模块专项",
		},
	]);
});

test("多条结果按上报顺序折算，同一任务的行合进同一组", () => {
	const reconciled = reconcile(
		[
			regressionRow({ runCaseId: "rc-a", sourceRef: "A" }),
			regressionRow({ caseId: CASE_B, runCaseId: "rc-b", sourceRef: "B" }),
		],
		null,
		[
			{ message: "expected 200, got 500", result: "failed", sourceRef: "B" },
			passed("MISSING"),
			passed("A"),
		]
	);
	expect(reconciled.unmatchedCases.map((entry) => entry.sourceRef)).toEqual([
		"MISSING",
	]);
	expect(reconciled.groups).toHaveLength(1);
	expect(reconciled.groups[0]?.items).toEqual([
		{
			comment: "expected 200, got 500",
			result: "failed",
			runCaseId: "rc-b",
			sourceRef: "B",
		},
		{ comment: null, result: "passed", runCaseId: "rc-a", sourceRef: "A" },
	]);
});
