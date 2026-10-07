import { expect, test } from "vitest";

import {
	RUN_CASE_ONE,
	RUN_CASE_TWO,
	RUN_ONE,
	RUN_TWO,
	registerItem,
} from "./attachment-fixtures";
import {
	buildRegisterRejections,
	describeRunCaseVanished,
	describeRunUnwritable,
	groupRegisterItemsByRunId,
} from "./attachment-reconcile";

test("登记请求按任务分组，组内保留请求里的下标", () => {
	const groups = groupRegisterItemsByRunId([
		registerItem(RUN_ONE, RUN_CASE_ONE),
		registerItem(RUN_TWO, RUN_CASE_TWO),
		registerItem(RUN_ONE, RUN_CASE_ONE),
	]);
	expect(groups.map((group) => group.runId)).toEqual([RUN_ONE, RUN_TWO]);
	expect(groups[0]?.items.map((item) => item.index)).toEqual([0, 2]);
	expect(groups[1]?.items.map((item) => item.index)).toEqual([1]);
});

test("整组被拒时逐条落进对账单，定位靠 runCaseId + storageKey", () => {
	const [group] = groupRegisterItemsByRunId([
		registerItem(RUN_ONE, RUN_CASE_ONE),
	]);
	expect(buildRegisterRejections(group?.items ?? [], "任务已锁定")).toEqual([
		{
			index: 0,
			reason: "任务已锁定",
			runCaseId: RUN_CASE_ONE,
			storageKey: `test-runs/p/${RUN_ONE}/${RUN_CASE_ONE}/screenshot-x.png`,
		},
	]);
});

test("拿不到任务名时说「该测试任务」，不在文案里念 uuid", () => {
	expect(describeRunCaseVanished(null)).toBe(
		"该测试任务的用例范围被改动，这条用例行已不在其中，请重跑"
	);
	expect(describeRunCaseVanished("冒烟")).toContain("测试任务「冒烟」");
	expect(describeRunUnwritable({ kind: "not-found" }, null)).toBe(
		"该测试任务已不存在，附件未受理"
	);
	expect(
		describeRunUnwritable(
			{ kind: "locked", submittedAt: new Date("2026-01-02T03:04:05Z") },
			"冒烟"
		)
	).toContain("测试任务「冒烟」已于");
});
