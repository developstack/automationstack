import { expect, test } from "vitest";

import { MAX_ATTACHMENT_BYTES } from "../attachment-policy";
import {
	CASE_B,
	orphanRow,
	PENDING_REVIEW,
	plan,
	REGRESSION,
	RUN_CASE_ONE,
	RUN_CASE_TWO,
	RUN_ONE,
	RUN_TWO,
	row,
	screenshot,
} from "./attachment-fixtures";

test("一条 sourceRef 落在两个任务上，各得一份独立的待签名条目", () => {
	const planned = plan([row(), row(REGRESSION)]);
	expect(planned.rejected).toEqual([]);
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

test.each([
	["大小", screenshot("A", MAX_ATTACHMENT_BYTES + 1), "超过单文件上限"],
	[
		"类型",
		{
			contentType: "video/mp4",
			kind: "screenshot",
			sizeBytes: 1024,
			sourceRef: "A",
		},
		"不支持",
	],
] as const)(
	"单文件%s不合规只拒一条，不按任务重复",
	(_label, attachment, reason) => {
		const planned = plan([row(), row(REGRESSION)], null, [attachment]);
		expect(planned.groups).toEqual([]);
		expect(planned.rejected).toHaveLength(1);
		expect(planned.rejected[0]?.reason).toContain(reason);
		expect(planned.rejected[0]?.runName).toBeNull();
	}
);

test("「用例不存在」与「没有任务收它」是两个不同的拒绝理由", () => {
	const planned = plan([orphanRow(CASE_B, "B")], null, [
		screenshot("A"),
		screenshot("B"),
	]);
	expect(planned.groups).toEqual([]);
	expect(planned.rejected.map((entry) => entry.reason)).toEqual([
		"项目里没有这个 sourceRef 的用例",
		"不在任何未提交任务的范围内",
	]);
});

test("待评审的任务指名拒绝，且不再补一条「不在任何未提交任务范围内」", () => {
	const planned = plan([row(PENDING_REVIEW)]);
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
	const planned = plan([row(PENDING_REVIEW), row(REGRESSION)]);
	expect(planned.groups).toHaveLength(1);
	expect(planned.groups[0]?.runId).toBe(RUN_TWO);
	expect(planned.rejected).toHaveLength(1);
});

test("拒绝按请求里的下标排序，SDK 可以顺着文件清单逐行核对", () => {
	const planned = plan([row()], null, [
		screenshot("A"),
		screenshot("MISSING"),
		screenshot("A", MAX_ATTACHMENT_BYTES + 1),
	]);
	expect(planned.rejected.map((entry) => entry.index)).toEqual([1, 2]);
});
