import { describe, expect, it } from "vitest";

import type { TestRun } from "../schema/test-runs";
import {
	classifySubmitRejection,
	deriveRunStatusSteps,
	evaluateRunVoidable,
	evaluateRunWritable,
} from "./test-run-status-core";

const VOIDED_AT = new Date("2026-08-12T08:00:00Z");

function makeRun(overrides: Partial<TestRun> = {}): TestRun {
	return {
		completedAt: null,
		createdAt: new Date("2026-08-01T00:00:00Z"),
		createdBy: null,
		description: null,
		id: "11111111-1111-1111-1111-111111111111",
		name: "支付回归",
		projectId: "22222222-2222-2222-2222-222222222222",
		reviewedAt: null,
		reviewedBy: null,
		startedAt: null,
		status: "in_progress",
		submittedAt: null,
		submittedBy: null,
		updatedAt: new Date("2026-08-01T00:00:00Z"),
		voidedAt: null,
		voidedBy: null,
		voidReason: null,
		...overrides,
	};
}

describe("deriveRunStatusSteps", () => {
	it.each([
		["打完最后一条结论后自动完成", "in_progress", [10, 0], ["completed"]],
		["还有未测时保持测试中", "in_progress", [10, 1], []],
		[
			"已完成的测试任务回退一条结论自动退回测试中",
			"completed",
			[10, 1],
			["in_progress"],
		],
		[
			"已完成的测试任务追加用例（多出未测行）同样自动退回测试中",
			"completed",
			[13, 3],
			["in_progress"],
		],
		[
			"待测试的测试任务打第一条结论转为测试中",
			"ready",
			[10, 9],
			["in_progress"],
		],
		[
			"待测试的测试任务被一键全部通过时，开测与完成两条流转都要留下",
			"ready",
			[10, 0],
			["in_progress", "completed"],
		],
		[
			"待评审的测试任务不会被结论推进（评审只能人工签字）",
			"pending_review",
			[10, 0],
			[],
		],
		["已提交是终态，任何统计都不再推进它", "submitted", [10, 4], []],
		["已作废是终态，任何统计都不再推进它", "voided", [10, 0], []],
		[
			"空测试任务不算完成——否则刚建的空任务会被自动提交锁死",
			"in_progress",
			[0, 0],
			[],
		],
		["空的待测试任务同样不推进", "ready", [0, 0], []],
		[
			"测试中把结论全撤光也不退回待测试（startedAt 是既成事实）",
			"in_progress",
			[10, 10],
			[],
		],
	] as const)("%s", (_name, status, [total, untested], expected) => {
		expect(deriveRunStatusSteps(status, { total, untested })).toEqual(expected);
	});
});

describe("evaluateRunWritable", () => {
	it("未提交的测试任务可写", () => {
		const run = makeRun();
		expect(evaluateRunWritable(run)).toEqual({ kind: "ok", run });
	});

	it("已提交的测试任务拒绝一切写操作，并带回锁定时刻", () => {
		const submittedAt = new Date("2026-08-10T03:00:00Z");
		expect(
			evaluateRunWritable(makeRun({ status: "submitted", submittedAt }))
		).toEqual({ kind: "locked", submittedAt });
	});

	it("已作废的测试任务拒绝一切写操作，并带回作废时刻", () => {
		expect(
			evaluateRunWritable(makeRun({ status: "voided", voidedAt: VOIDED_AT }))
		).toEqual({ kind: "voided", voidedAt: VOIDED_AT });
	});

	it("测试任务不存在时返回 not-found 而不是抛异常", () => {
		expect(evaluateRunWritable(undefined)).toEqual({ kind: "not-found" });
	});
});

describe("evaluateRunVoidable", () => {
	it.each(["pending_review", "ready", "in_progress"] as const)(
		"「%s」的测试任务可以作废",
		(status) => {
			const run = makeRun({ status });
			expect(evaluateRunVoidable(run)).toEqual({ kind: "ok", run });
		}
	);

	it.each(["completed", "submitted"] as const)(
		"「%s」的测试任务不能作废，回带当前状态",
		(status) => {
			expect(evaluateRunVoidable(makeRun({ status }))).toEqual({
				kind: "invalid-status",
				status,
			});
		}
	);

	it("作废是终态：再次作废按写锁拒绝", () => {
		expect(
			evaluateRunVoidable(makeRun({ status: "voided", voidedAt: VOIDED_AT }))
		).toEqual({ kind: "voided", voidedAt: VOIDED_AT });
	});

	it("测试任务不存在时返回 not-found", () => {
		expect(evaluateRunVoidable(undefined)).toEqual({ kind: "not-found" });
	});
});

describe("classifySubmitRejection", () => {
	it("重复提交是幂等的：第二次拿到「已提交」而不是异常", () => {
		const run = makeRun({
			status: "submitted",
			submittedAt: new Date("2026-08-10T03:00:00Z"),
			submittedBy: "33333333-3333-3333-3333-333333333333",
		});
		expect(classifySubmitRejection(run)).toEqual({
			kind: "already-submitted",
			run,
		});
	});

	it("没测完的测试任务提交失败，回带当前状态给用户解释", () => {
		expect(classifySubmitRejection(makeRun({ status: "in_progress" }))).toEqual(
			{
				kind: "invalid-status",
				status: "in_progress",
			}
		);
	});

	it("已作废的测试任务提交时按写锁拒绝，而不是「尚未完成」", () => {
		expect(
			classifySubmitRejection(
				makeRun({ status: "voided", voidedAt: VOIDED_AT })
			)
		).toEqual({ kind: "voided", voidedAt: VOIDED_AT });
	});

	it("测试任务已被删时返回 not-found", () => {
		expect(classifySubmitRejection(undefined)).toEqual({ kind: "not-found" });
	});
});
