import { expect, test } from "vitest";
import {
	CASE_A,
	paymentRow,
	RUN_TWO,
	reconcile,
	regressionRow,
} from "./execution-reconcile-fixtures";

const PENDING = { status: "pending_review" } as const;

test("runIds 白名单排除掉的候选任务：理由要说得出是哪个任务，且不是「不在任何未提交任务里」", () => {
	const reconciled = reconcile([regressionRow()], [RUN_TWO]);
	expect(reconciled.groups).toEqual([]);
	expect(reconciled.unexplained).toEqual([]);
	expect(reconciled.outOfScope).toHaveLength(1);
	expect(reconciled.outOfScope[0]?.runName).toBe("v2.3 回归");
	expect(reconciled.outOfScope[0]?.caseId).toBe(CASE_A);
	expect(reconciled.outOfScope[0]?.reason).toContain("v2.3 回归");
	expect(reconciled.outOfScope[0]?.reason).toContain("runIds");
	expect(reconciled.outOfScope[0]?.reason).not.toContain(
		"不在任何未提交任务的范围内"
	);
});

test("runIds 空数组 = 谁都不写，与 null（不收窄）给出完全不同的对账单", () => {
	const narrowedToNobody = reconcile([regressionRow()], []);
	expect(narrowedToNobody.groups).toEqual([]);
	expect(narrowedToNobody.outOfScope).toHaveLength(1);
	expect(narrowedToNobody.outOfScope[0]?.reason).toContain("v2.3 回归");
	const notNarrowed = reconcile([regressionRow()], null);
	expect(notNarrowed.outOfScope).toEqual([]);
	expect(notNarrowed.groups).toHaveLength(1);
});

test("白名单里的任务照常写入，被排除的那个不因为写成功而多出一条越界", () => {
	const reconciled = reconcile([regressionRow(), paymentRow()], [RUN_TWO]);
	expect(reconciled.groups).toHaveLength(1);
	expect(reconciled.groups[0]?.runId).toBe(RUN_TWO);
	expect(reconciled.outOfScope).toEqual([]);
	expect(reconciled.unexplained).toEqual([]);
});

test("同时被白名单排除又在待评审时，只说那条真正生效的理由（白名单）", () => {
	const reconciled = reconcile([regressionRow(PENDING)], [RUN_TWO]);
	expect(reconciled.outOfScope).toHaveLength(1);
	expect(reconciled.outOfScope[0]?.reason).toContain("runIds");
	expect(reconciled.outOfScope[0]?.reason).not.toContain("待评审");
	expect(reconciled.unexplained).toEqual([]);
});

test("待评审的任务在发事务之前就摘出去，其余任务照常写", () => {
	const reconciled = reconcile([regressionRow(PENDING), paymentRow()]);
	expect(reconciled.groups).toHaveLength(1);
	expect(reconciled.groups[0]?.runId).toBe(RUN_TWO);
	expect(reconciled.outOfScope).toEqual([
		{
			caseId: CASE_A,
			reason: "测试任务「v2.3 回归」还在待评审，不接受结论",
			runName: "v2.3 回归",
			sourceRef: "SHARED",
		},
	]);
});

test("候选全被待评审挡下时不再补一条「不在任何未提交任务的范围内」", () => {
	const reconciled = reconcile([regressionRow(PENDING)]);
	expect(reconciled.groups).toEqual([]);
	expect(reconciled.outOfScope).toHaveLength(1);
	expect(reconciled.outOfScope[0]?.runName).toBe("v2.3 回归");
});
