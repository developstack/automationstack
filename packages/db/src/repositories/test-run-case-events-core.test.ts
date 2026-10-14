import { describe, expect, it } from "vitest";

import type { TestRunCaseResult } from "../schema/test-runs";
import {
	type BuildRunCaseEventRowsInput,
	buildRunCaseEventRows,
	type RunCaseVerdictSnapshot,
} from "./test-run-case-events-core";

const ZHANG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LI = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CASE_A = "11111111-1111-1111-1111-111111111111";
const CASE_B = "22222222-2222-2222-2222-222222222222";
const CASE_C = "33333333-3333-3333-3333-333333333333";
const SCRIPT_COMMENT = "assert timeout at checkout.spec.ts:42";

function snapshot(
	result: TestRunCaseResult,
	overrides: Partial<RunCaseVerdictSnapshot> = {}
): RunCaseVerdictSnapshot {
	return { comment: null, id: CASE_A, result, ...overrides };
}

function input(
	toResult: TestRunCaseResult,
	snapshots: RunCaseVerdictSnapshot[],
	overrides: Partial<BuildRunCaseEventRowsInput> = {}
): BuildRunCaseEventRowsInput {
	return { actorId: ZHANG, snapshots, toResult, ...overrides };
}

/** 期望落下的一条流水。 */
function event(
	fromResult: TestRunCaseResult,
	toResult: TestRunCaseResult,
	comment: string | null = null,
	overrides: { actorId?: string | null; runCaseId?: string } = {}
) {
	return {
		actorId: ZHANG,
		comment,
		fromResult,
		runCaseId: CASE_A,
		toResult,
		...overrides,
	};
}

describe("buildRunCaseEventRows", () => {
	it.each([
		[
			"一次结论变更落一条流水，来源态、目标态、操作人都对得上",
			input("passed", [snapshot("untested")]),
			[event("untested", "passed")],
		],
		[
			"重复打同一个结论不产生流水（快捷键连按不该刷屏）",
			input("passed", [snapshot("passed")]),
			[],
		],
		[
			"只改说明（结论回传的是当前值）同样不产生流水",
			input("failed", [snapshot("failed", { comment: "旧说明" })], {
				comment: "补一句复现路径",
			}),
			[],
		],
		[
			"打回未测要记一条，说明快照是被清掉之前的那段文字",
			input(
				"untested",
				[snapshot("failed", { comment: "支付超时，订单状态没回滚" })],
				{ actorId: LI }
			),
			[
				event("failed", "untested", "支付超时，订单状态没回滚", {
					actorId: LI,
				}),
			],
		],
		[
			"打回未测时调用方给的说明不算数——它根本不会被写进行里",
			input("untested", [snapshot("blocked", { comment: "环境挂了" })], {
				comment: "随手带过来的文字",
			}),
			[event("blocked", "untested", "环境挂了")],
		],
		[
			"显式给了说明就记它（那是这次变更当时写下的理由）",
			input("failed", [snapshot("untested", { comment: "上一次的说明" })], {
				comment: "重试三次都超时",
			}),
			[event("untested", "failed", "重试三次都超时")],
		],
		[
			"显式清空说明也照记（null 与「没给」是两回事）",
			input("passed", [snapshot("untested", { comment: "旧说明" })], {
				comment: null,
			}),
			[event("untested", "passed", null)],
		],
		[
			"没给说明时记行上原有的那段（不动它，生效后的值就等于原值）",
			input("failed", [snapshot("blocked", { comment: "环境挂了" })]),
			[event("blocked", "failed", "环境挂了")],
		],
		[
			"批量打结论给每条变更了的用例各落一条，一次返回、一条 INSERT",
			input("passed", [
				snapshot("untested"),
				snapshot("blocked", { comment: "环境挂了", id: CASE_B }),
				snapshot("failed", { id: CASE_C }),
			]),
			[
				event("untested", "passed"),
				event("blocked", "passed", "环境挂了", { runCaseId: CASE_B }),
				event("failed", "passed", null, { runCaseId: CASE_C }),
			],
		],
		[
			"一键全部通过时，本来就已经通过的那些行不进流水",
			input("passed", [
				snapshot("passed"),
				snapshot("untested", { id: CASE_B }),
				snapshot("passed", { id: CASE_C }),
			]),
			[event("untested", "passed", null, { runCaseId: CASE_B })],
		],
		[
			"整批都没变化时返回空数组——调用方据此一条 SQL 都不发",
			input("passed", [snapshot("passed"), snapshot("passed", { id: CASE_B })]),
			[],
		],
		[
			"操作人可空（系统写入 / 账号已删）时流水照落",
			input("skipped", [snapshot("untested")], { actorId: null }),
			[event("untested", "skipped", null, { actorId: null })],
		],
	])("%s", (_name, given, expected) => {
		expect(buildRunCaseEventRows(given)).toEqual(expected);
	});
});

describe("buildRunCaseEventRows（自动化接管人工结论）", () => {
	const takeover = { actorId: LI, automationTakeover: true };

	it.each([
		[
			"结论没变时，手工路径即便快照带着 manual 也不记（回归保护）",
			input("passed", [
				snapshot("passed", { executedVia: "manual" }),
				snapshot("passed", {
					comment: "手点的说明",
					executedVia: "manual",
					id: CASE_B,
				}),
			]),
			[],
		],
		[
			"自动化顶掉人工结论时照记一行，说明是被覆盖掉的那一段",
			input(
				"failed",
				[
					snapshot("failed", {
						comment: "支付网关 502，联系运维了",
						executedVia: "manual",
					}),
				],
				{ ...takeover, comment: SCRIPT_COMMENT }
			),
			[event("failed", "failed", "支付网关 502，联系运维了", { actorId: LI })],
		],
		[
			"自动化重跑出同样结论不记（旧来源已是 automation，什么都没被顶掉）",
			input(
				"failed",
				[
					snapshot("failed", {
						comment: SCRIPT_COMMENT,
						executedVia: "automation",
					}),
				],
				{ ...takeover, comment: SCRIPT_COMMENT }
			),
			[],
		],
		[
			"从没打过结论的行（来源为空）被自动化写上同样结论也不记",
			input("passed", [snapshot("passed", { executedVia: null })], {
				...takeover,
				comment: "脚本的说明",
			}),
			[],
		],
		[
			"自动化把结论改掉时照旧记，说明仍是脚本这次写的那段",
			input(
				"failed",
				[
					snapshot("passed", {
						comment: "上一轮是过的",
						executedVia: "manual",
					}),
				],
				{ ...takeover, comment: SCRIPT_COMMENT }
			),
			[event("passed", "failed", SCRIPT_COMMENT, { actorId: LI })],
		],
		[
			"同一批里接管与变更混着来，各按各的规则记",
			input(
				"failed",
				[
					snapshot("failed", { comment: "人写的理由", executedVia: "manual" }),
					snapshot("failed", { executedVia: "automation", id: CASE_B }),
					snapshot("passed", { executedVia: "manual", id: CASE_C }),
				],
				{ ...takeover, comment: "脚本的说明" }
			),
			[
				event("failed", "failed", "人写的理由", { actorId: LI }),
				event("passed", "failed", "脚本的说明", {
					actorId: LI,
					runCaseId: CASE_C,
				}),
			],
		],
	])("%s", (_name, given, expected) => {
		expect(buildRunCaseEventRows(given)).toEqual(expected);
	});
});
