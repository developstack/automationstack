import { expect, test } from "vitest";

import {
	PENDING_REVIEW,
	plan,
	REGRESSION,
	RUN_TWO,
	row,
} from "./attachment-fixtures";

const WHITELIST_REASON =
	"测试任务「冒烟」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，附件未获签名";

test("白名单排除的候选任务：拒绝理由指名任务，且与「没有任务收它」是两句话", () => {
	const planned = plan([row()], [RUN_TWO]);
	expect(planned.groups).toEqual([]);
	expect(planned.rejected).toEqual([
		{ index: 0, reason: WHITELIST_REASON, runName: "冒烟", sourceRef: "A" },
	]);
});

test("白名单命中的任务照常签，被排除的那个不在成功件的对账单里刷存在感", () => {
	const planned = plan([row(), row(REGRESSION)], [RUN_TWO]);
	expect(planned.groups).toHaveLength(1);
	expect(planned.groups[0]?.runId).toBe(RUN_TWO);
	expect(planned.rejected).toEqual([]);
});

test("空白名单与不传白名单不是一回事：空数组谁都不签", () => {
	const noNarrowing = plan([row()], null);
	expect(noNarrowing.groups).toHaveLength(1);
	expect(noNarrowing.rejected).toEqual([]);
	const nobody = plan([row()], []);
	expect(nobody.groups).toEqual([]);
	expect(nobody.rejected[0]?.reason).toContain("白名单没有带上它");
});

test("同时被白名单排除又在待评审时，只说白名单那条真正生效的理由", () => {
	const planned = plan([row(PENDING_REVIEW)], [RUN_TWO]);
	expect(planned.groups).toEqual([]);
	expect(planned.rejected).toHaveLength(1);
	expect(planned.rejected[0]?.reason).toContain("白名单没有带上它");
	expect(planned.rejected[0]?.reason).not.toContain("待评审");
});

test("白名单排除与待评审各指各的任务，两条理由并存不矛盾", () => {
	const planned = plan(
		[row(), row({ ...REGRESSION, ...PENDING_REVIEW })],
		[RUN_TWO]
	);
	expect(planned.groups).toEqual([]);
	expect(
		planned.rejected.map((entry) => [entry.runName, entry.reason])
	).toEqual([
		["评审中", "测试任务「评审中」还在待评审，不接受附件"],
		["冒烟", WHITELIST_REASON],
	]);
});
