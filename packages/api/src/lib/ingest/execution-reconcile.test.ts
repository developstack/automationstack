import { expect, test } from "vitest";
import {
	buildUnexplainedOutOfScopeEntries,
	reconcileAutomationTargets,
} from "./execution-reconcile";
import {
	CASE_A,
	CASE_B,
	orphanRow,
	passed,
	RUN_ONE,
	RUN_TWO,
	targetRow,
} from "./execution-reconcile-fixtures";

test("解析不到任何行的 sourceRef 进 unmatchedCases，且不带 caseId", () => {
	const reconciled = reconcileAutomationTargets({
		results: [passed("MISSING")],
		rows: [],
		runIds: null,
	});
	expect(reconciled.groups).toEqual([]);
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.unmatchedCases).toEqual([
		{ reason: "项目里没有这个 sourceRef 的用例", sourceRef: "MISSING" },
	]);
});

test("用例存在但没有候选任务时先进 unexplained，等诊断后才落 outOfScope（D24 要 caseId）", () => {
	const reconciled = reconcileAutomationTargets({
		results: [passed("ORPHAN")],
		rows: [orphanRow(CASE_A, "ORPHAN")],
		runIds: null,
	});
	expect(reconciled.unmatchedCases).toEqual([]);
	expect(reconciled.groups).toEqual([]);
	// 落空但还没有解释：这一步不下结论，因为「没有任何任务收它」与
	// 「收它的任务已经提交了」在这里还分不出来。
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.unexplained).toEqual([
		{ caseId: CASE_A, sourceRef: "ORPHAN" },
	]);
	// 诊断查不到已提交的任务 → 才是真的「不在任何未提交任务的范围内」。
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
	const reconciled = reconcileAutomationTargets({
		results: [passed("ORPHAN")],
		rows: [orphanRow(CASE_A, "ORPHAN")],
		runIds: null,
	});
	const entries = buildUnexplainedOutOfScopeEntries(reconciled.unexplained, [
		{
			runName: "v2.2 回归",
			sourceRef: "ORPHAN",
			submittedAt: new Date("2026-08-20T02:00:00Z"),
		},
	]);
	expect(entries).toHaveLength(1);
	expect(entries[0]?.caseId).toBe(CASE_A);
	expect(entries[0]?.runName).toBe("v2.2 回归");
	expect(entries[0]?.reason).toContain("v2.2 回归");
	expect(entries[0]?.reason).toContain("已提交并锁定");
	expect(entries[0]?.reason).toContain("新建测试任务");
	expect(entries[0]?.reason).not.toContain("不在任何未提交任务的范围内");
});

test("同一条 sourceRef 命中两个任务时按 runId 分成两组", () => {
	const reconciled = reconcileAutomationTargets({
		results: [passed("SHARED", "  boom  ")],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: "rc-1",
				runId: RUN_ONE,
				runName: "v2.3 回归",
				sourceRef: "SHARED",
			}),
			targetRow({
				caseId: CASE_A,
				runCaseId: "rc-2",
				runId: RUN_TWO,
				runName: "支付模块专项",
				sourceRef: "SHARED",
			}),
		],
		runIds: null,
	});
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.groups).toEqual([
		{
			items: [
				{
					comment: "boom",
					result: "passed",
					runCaseId: "rc-1",
					sourceRef: "SHARED",
				},
			],
			runId: RUN_ONE,
			runName: "v2.3 回归",
		},
		{
			items: [
				{
					comment: "boom",
					result: "passed",
					runCaseId: "rc-2",
					sourceRef: "SHARED",
				},
			],
			runId: RUN_TWO,
			runName: "支付模块专项",
		},
	]);
});

test("多条结果按上报顺序折算，同一任务的行合进同一组", () => {
	const reconciled = reconcileAutomationTargets({
		results: [
			{ message: "expected 200, got 500", result: "failed", sourceRef: "B" },
			passed("MISSING"),
			passed("A"),
		],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: "rc-a",
				runId: RUN_ONE,
				runName: "v2.3 回归",
				sourceRef: "A",
			}),
			targetRow({
				caseId: CASE_B,
				runCaseId: "rc-b",
				runId: RUN_ONE,
				runName: "v2.3 回归",
				sourceRef: "B",
			}),
		],
		runIds: null,
	});
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

test("一行都解析不到时全部进 unmatched（与白名单无关）", () => {
	const reconciled = reconcileAutomationTargets({
		results: [passed("A"), passed("B")],
		rows: [],
		runIds: null,
	});
	expect(reconciled.unmatchedCases).toHaveLength(2);
	expect(reconciled.groups).toEqual([]);
});
