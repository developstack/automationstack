import { describe, expect, it } from "vitest";

import type { TestRun } from "../schema/test-runs";
import {
	classifySubmitRejection,
	deriveRunStatusSteps,
	evaluateRunWritable,
} from "./test-run-status-core";

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
		...overrides,
	};
}

describe("deriveRunStatusSteps", () => {
	it("打完最后一条结论后自动完成", () => {
		expect(
			deriveRunStatusSteps("in_progress", { total: 10, untested: 0 })
		).toEqual(["completed"]);
	});

	it("还有未测时保持测试中", () => {
		expect(
			deriveRunStatusSteps("in_progress", { total: 10, untested: 1 })
		).toEqual([]);
	});

	it("已完成的测试任务回退一条结论自动退回测试中", () => {
		expect(
			deriveRunStatusSteps("completed", { total: 10, untested: 1 })
		).toEqual(["in_progress"]);
	});

	it("已完成的测试任务追加用例（多出未测行）同样自动退回测试中", () => {
		expect(
			deriveRunStatusSteps("completed", { total: 13, untested: 3 })
		).toEqual(["in_progress"]);
	});

	it("待测试的测试任务打第一条结论转为测试中", () => {
		expect(deriveRunStatusSteps("ready", { total: 10, untested: 9 })).toEqual([
			"in_progress",
		]);
	});

	it("待测试的测试任务被一键全部通过时，开测与完成两条流转都要留下", () => {
		expect(deriveRunStatusSteps("ready", { total: 10, untested: 0 })).toEqual([
			"in_progress",
			"completed",
		]);
	});

	it("待评审的测试任务不会被结论推进（评审只能人工签字）", () => {
		expect(
			deriveRunStatusSteps("pending_review", { total: 10, untested: 0 })
		).toEqual([]);
	});

	it("已提交是终态，任何统计都不再推进它", () => {
		expect(
			deriveRunStatusSteps("submitted", { total: 10, untested: 4 })
		).toEqual([]);
	});

	it("空测试任务不算完成——否则刚建的空任务会被自动提交锁死", () => {
		expect(
			deriveRunStatusSteps("in_progress", { total: 0, untested: 0 })
		).toEqual([]);
		expect(deriveRunStatusSteps("ready", { total: 0, untested: 0 })).toEqual(
			[]
		);
	});

	it("测试中把结论全撤光也不退回待测试（startedAt 是既成事实）", () => {
		expect(
			deriveRunStatusSteps("in_progress", { total: 10, untested: 10 })
		).toEqual([]);
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

	it("测试任务不存在时返回 not-found 而不是抛异常", () => {
		expect(evaluateRunWritable(undefined)).toEqual({ kind: "not-found" });
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

	it("测试任务已被删时返回 not-found", () => {
		expect(classifySubmitRejection(undefined)).toEqual({ kind: "not-found" });
	});
});
