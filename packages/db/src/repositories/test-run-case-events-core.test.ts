/**
 * 用例结论流水是「谁通过的、谁打回的、几点、当时写了什么」唯一的答案来源，
 * 而它的两种错法都不会报错：少记一条，时间线看着完整、缺的那环无迹可寻；
 * 记错说明，报告里那句失败原因会安到另一次变更头上。
 * 判定本身因此必须是纯的、逐条钉死的——事务那边只负责取旧值和落库。
 */
import { describe, expect, it } from "vitest";

import {
	buildRunCaseEventRows,
	type RunCaseVerdictSnapshot,
} from "./test-run-case-events-core";

const ZHANG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LI = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CASE_A = "11111111-1111-1111-1111-111111111111";
const CASE_B = "22222222-2222-2222-2222-222222222222";
const CASE_C = "33333333-3333-3333-3333-333333333333";

function snapshot(
	overrides: Partial<RunCaseVerdictSnapshot> = {}
): RunCaseVerdictSnapshot {
	return {
		comment: null,
		id: CASE_A,
		result: "untested",
		...overrides,
	};
}

describe("buildRunCaseEventRows", () => {
	it("一次结论变更落一条流水，来源态、目标态、操作人都对得上", () => {
		expect(
			buildRunCaseEventRows({
				actorId: ZHANG,
				snapshots: [snapshot({ result: "untested" })],
				toResult: "passed",
			})
		).toEqual([
			{
				actorId: ZHANG,
				comment: null,
				fromResult: "untested",
				runCaseId: CASE_A,
				toResult: "passed",
			},
		]);
	});

	it("重复打同一个结论不产生流水（快捷键连按不该刷屏）", () => {
		expect(
			buildRunCaseEventRows({
				actorId: ZHANG,
				snapshots: [snapshot({ result: "passed" })],
				toResult: "passed",
			})
		).toEqual([]);
	});

	it("只改说明（结论回传的是当前值）同样不产生流水", () => {
		expect(
			buildRunCaseEventRows({
				actorId: ZHANG,
				comment: "补一句复现路径",
				snapshots: [snapshot({ comment: "旧说明", result: "failed" })],
				toResult: "failed",
			})
		).toEqual([]);
	});

	it("打回未测要记一条，说明快照是被清掉之前的那段文字", () => {
		const rows = buildRunCaseEventRows({
			actorId: LI,
			snapshots: [
				snapshot({ comment: "支付超时，订单状态没回滚", result: "failed" }),
			],
			toResult: "untested",
		});
		expect(rows).toEqual([
			{
				actorId: LI,
				comment: "支付超时，订单状态没回滚",
				fromResult: "failed",
				runCaseId: CASE_A,
				toResult: "untested",
			},
		]);
	});

	it("打回未测时调用方给的说明不算数——它根本不会被写进行里", () => {
		const [row] = buildRunCaseEventRows({
			actorId: LI,
			comment: "随手带过来的文字",
			snapshots: [snapshot({ comment: "环境挂了", result: "blocked" })],
			toResult: "untested",
		});
		expect(row?.comment).toBe("环境挂了");
	});

	it("显式给了说明就记它（那是这次变更当时写下的理由）", () => {
		const [row] = buildRunCaseEventRows({
			actorId: ZHANG,
			comment: "重试三次都超时",
			snapshots: [snapshot({ comment: "上一次的说明", result: "untested" })],
			toResult: "failed",
		});
		expect(row?.comment).toBe("重试三次都超时");
	});

	it("显式清空说明也照记（null 与「没给」是两回事）", () => {
		const [row] = buildRunCaseEventRows({
			actorId: ZHANG,
			comment: null,
			snapshots: [snapshot({ comment: "旧说明", result: "untested" })],
			toResult: "passed",
		});
		expect(row?.comment).toBeNull();
	});

	it("没给说明时记行上原有的那段（不动它，生效后的值就等于原值）", () => {
		const [row] = buildRunCaseEventRows({
			actorId: ZHANG,
			snapshots: [snapshot({ comment: "环境挂了", result: "blocked" })],
			toResult: "failed",
		});
		expect(row?.comment).toBe("环境挂了");
	});

	it("批量打结论给每条变更了的用例各落一条，一次返回、一条 INSERT", () => {
		const rows = buildRunCaseEventRows({
			actorId: ZHANG,
			snapshots: [
				snapshot({ id: CASE_A, result: "untested" }),
				snapshot({ comment: "环境挂了", id: CASE_B, result: "blocked" }),
				snapshot({ id: CASE_C, result: "failed" }),
			],
			toResult: "passed",
		});
		expect(rows).toEqual([
			{
				actorId: ZHANG,
				comment: null,
				fromResult: "untested",
				runCaseId: CASE_A,
				toResult: "passed",
			},
			{
				actorId: ZHANG,
				comment: "环境挂了",
				fromResult: "blocked",
				runCaseId: CASE_B,
				toResult: "passed",
			},
			{
				actorId: ZHANG,
				comment: null,
				fromResult: "failed",
				runCaseId: CASE_C,
				toResult: "passed",
			},
		]);
	});

	it("一键全部通过时，本来就已经通过的那些行不进流水", () => {
		const rows = buildRunCaseEventRows({
			actorId: ZHANG,
			snapshots: [
				snapshot({ id: CASE_A, result: "passed" }),
				snapshot({ id: CASE_B, result: "untested" }),
				snapshot({ id: CASE_C, result: "passed" }),
			],
			toResult: "passed",
		});
		expect(rows.map((row) => row.runCaseId)).toEqual([CASE_B]);
	});

	it("整批都没变化时返回空数组——调用方据此一条 SQL 都不发", () => {
		expect(
			buildRunCaseEventRows({
				actorId: ZHANG,
				snapshots: [
					snapshot({ id: CASE_A, result: "passed" }),
					snapshot({ id: CASE_B, result: "passed" }),
				],
				toResult: "passed",
			})
		).toEqual([]);
	});

	it("操作人可空（系统写入 / 账号已删）时流水照落", () => {
		const [row] = buildRunCaseEventRows({
			actorId: null,
			snapshots: [snapshot({ result: "untested" })],
			toResult: "skipped",
		});
		expect(row?.actorId).toBeNull();
	});
});
