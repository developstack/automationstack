import { expect, test } from "vitest";

import { MAX_ATTACHMENT_BYTES } from "../attachment-policy";
import {
	CASE_A,
	CASE_B,
	orphanRow,
	RUN_CASE_ONE,
	RUN_CASE_TWO,
	RUN_ONE,
	RUN_TWO,
	screenshot,
	targetRow,
} from "./attachment-fixtures";
import { planAttachmentUploads } from "./attachment-reconcile";

test("一条 sourceRef 落在两个任务上，各得一份独立的待签名条目", () => {
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
		runIds: null,
	});
	expect(planned.rejected).toEqual([]);
	expect(planned.groups).toHaveLength(2);
	expect(planned.groups.map((group) => group.runId)).toEqual([
		RUN_ONE,
		RUN_TWO,
	]);
	expect(
		planned.groups.flatMap((group) =>
			group.items.map((item) => [item.index, item.runCaseId])
		)
	).toEqual([
		[0, RUN_CASE_ONE],
		[0, RUN_CASE_TWO],
	]);
});

test("单文件类型/大小不合规只拒一条，不按任务重复", () => {
	const rows = [
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
	];
	const oversized = planAttachmentUploads({
		attachments: [screenshot("A", MAX_ATTACHMENT_BYTES + 1)],
		rows,
		runIds: null,
	});
	expect(oversized.groups).toEqual([]);
	expect(oversized.rejected).toHaveLength(1);
	expect(oversized.rejected[0]?.reason).toContain("超过单文件上限");
	expect(oversized.rejected[0]?.runName).toBeNull();

	const wrongType = planAttachmentUploads({
		attachments: [
			{
				contentType: "video/mp4",
				kind: "screenshot",
				sizeBytes: 1024,
				sourceRef: "A",
			},
		],
		rows,
		runIds: null,
	});
	expect(wrongType.groups).toEqual([]);
	expect(wrongType.rejected).toHaveLength(1);
	expect(wrongType.rejected[0]?.reason).toContain("不支持");
});

test("「用例不存在」与「没有任务收它」是两个不同的拒绝理由", () => {
	const planned = planAttachmentUploads({
		attachments: [screenshot("A"), screenshot("B")],
		rows: [orphanRow(CASE_B, "B")],
		runIds: null,
	});
	expect(planned.groups).toEqual([]);
	expect(planned.rejected.map((entry) => entry.reason)).toEqual([
		"项目里没有这个 sourceRef 的用例",
		"不在任何未提交任务的范围内",
	]);
});

test("待评审的任务指名拒绝，且不再补一条「不在任何未提交任务范围内」", () => {
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
		runIds: null,
	});
	expect(planned.groups).toEqual([]);
	expect(planned.rejected).toEqual([
		{
			index: 0,
			reason: "测试任务「评审中」还在待评审，不接受附件",
			runName: "评审中",
			sourceRef: "A",
		},
	]);
});

test("待评审任务被摘掉后，其余可写任务照常签", () => {
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
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_TWO,
				runId: RUN_TWO,
				runName: "回归",
				sourceRef: "A",
			}),
		],
		runIds: null,
	});
	expect(planned.groups).toHaveLength(1);
	expect(planned.groups[0]?.runId).toBe(RUN_TWO);
	expect(planned.rejected).toHaveLength(1);
});

test("拒绝按请求里的下标排序，SDK 可以顺着文件清单逐行核对", () => {
	const planned = planAttachmentUploads({
		attachments: [
			screenshot("A"),
			screenshot("MISSING"),
			screenshot("A", MAX_ATTACHMENT_BYTES + 1),
		],
		rows: [
			targetRow({
				caseId: CASE_A,
				runCaseId: RUN_CASE_ONE,
				runId: RUN_ONE,
				runName: "冒烟",
				sourceRef: "A",
			}),
		],
		runIds: null,
	});
	expect(planned.rejected.map((entry) => entry.index)).toEqual([1, 2]);
});
