import { expect, test } from "vitest";

import {
	CASE_A,
	RUN_CASE_ONE,
	RUN_CASE_TWO,
	RUN_ONE,
	RUN_TWO,
	screenshot,
	targetRow,
} from "./attachment-fixtures";
import { planAttachmentUploads } from "./attachment-reconcile";

/**
 * §5.1.1 的 `runIds` 白名单在折算层收窄（不在 SQL 里）之后才有可能成立的用例：
 * 被排除的候选任务仍然可见，于是能给出一条**指名道姓**的独立理由，
 * 而不是与「压根没有任务收它」糊成同一句假话。
 *
 * 判据顺序与配额分别在 `./attachment-reconcile.test` 与
 * `./attachment-plan-quota.test`；共用的构造器在 `./attachment-fixtures`。
 */

test("白名单排除的候选任务：拒绝理由指名任务，且与「没有任务收它」是两句话", () => {
	const planned = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_ONE,
				runId: RUN_ONE,
				runName: "冒烟",
				sourceRef: "A",
			}),
		],
		runIds: [RUN_TWO],
	});
	expect(planned.groups).toEqual([]);
	// 关键：不是「不在任何未提交任务的范围内」——任务是现成的，人该改的是 CI 的白名单。
	expect(planned.rejected).toEqual([
		{
			index: 0,
			reason:
				"测试任务「冒烟」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，附件未获签名",
			runName: "冒烟",
			sourceRef: "A",
		},
	]);
});

test("白名单命中的任务照常签，被排除的那个不在成功件的对账单里刷存在感", () => {
	const planned = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_ONE,
				runId: RUN_ONE,
				runName: "冒烟",
				sourceRef: "A",
			}),
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_TWO,
				runId: RUN_TWO,
				runName: "回归",
				sourceRef: "A",
			}),
		],
		runIds: [RUN_TWO],
	});
	expect(planned.groups).toHaveLength(1);
	expect(planned.groups[0]?.runId).toBe(RUN_TWO);
	expect(planned.rejected).toEqual([]);
});

test("空白名单与不传白名单不是一回事：空数组谁都不签", () => {
	const rows = [
		targetRow({
			caseId: CASE_A,
			runCaseId: RUN_CASE_ONE,
			runId: RUN_ONE,
			runName: "冒烟",
			sourceRef: "A",
		}),
	];
	const noNarrowing = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows,
		runIds: null,
	});
	expect(noNarrowing.groups).toHaveLength(1);
	expect(noNarrowing.rejected).toEqual([]);
	const nobody = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows,
		runIds: [],
	});
	expect(nobody.groups).toEqual([]);
	expect(nobody.rejected[0]?.reason).toContain("白名单没有带上它");
});

test("同时被白名单排除又在待评审时，只说白名单那条真正生效的理由", () => {
	const planned = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_ONE,
				runId: RUN_ONE,
				runName: "评审中",
				sourceRef: "A",
				status: "pending_review",
			}),
		],
		runIds: [RUN_TWO],
	});
	expect(planned.groups).toEqual([]);
	// 说「还在待评审」等于暗示「评审完就会签出 URL」，而这轮压根不打算传它。
	expect(planned.rejected).toHaveLength(1);
	expect(planned.rejected[0]?.reason).toContain("白名单没有带上它");
	expect(planned.rejected[0]?.reason).not.toContain("待评审");
});

test("白名单排除与待评审各指各的任务，两条理由并存不矛盾", () => {
	const planned = planAttachmentUploads({
		attachments: [screenshot("A")],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_ONE,
				runId: RUN_ONE,
				runName: "冒烟",
				sourceRef: "A",
			}),
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_TWO,
				runId: RUN_TWO,
				runName: "评审中",
				sourceRef: "A",
				status: "pending_review",
			}),
		],
		runIds: [RUN_TWO],
	});
	expect(planned.groups).toEqual([]);
	expect(
		planned.rejected.map((entry) => [entry.runName, entry.reason])
	).toEqual([
		["评审中", "测试任务「评审中」还在待评审，不接受附件"],
		[
			"冒烟",
			"测试任务「冒烟」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，附件未获签名",
		],
	]);
});
