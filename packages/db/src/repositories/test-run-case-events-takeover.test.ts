/**
 * 审计流水那条**唯一的例外**：结论没变、但 `executedVia` 从 `manual` 翻成
 * `automation`（`buildRunCaseEventRows` 的 `automationTakeover`）。
 *
 * 与 `test-run-case-events-core.test.ts` 分文件只为 300 行上限，测的是同一个
 * 纯函数；分组语义一个字没改——那边钉的是丢弃规则本身，这边钉的是它的例外，
 * 以及**例外绝不能溢到手工路径上**：手工批量那条 SELECT 结构上就带着
 * `executedVia`，判据（旧来源是 manual、结论没变）在「一键全部通过」上同样成立，
 * 拦住它的只有「调用点没打开那个开关」这一件事。这里的第一条用例钉的就是它，
 * 一旦有人把开关改成默认打开、或改成从快照里嗅探，它会立刻变红。
 *
 * 例外的两个方向都不会报错：不记，被脚本顶掉的那句人工说明无声消失，
 * 时间线还停在「张三 未测 → 失败」；乱记，脚本重跑一次刷一屏
 * `failed → failed`，真正的接管淹在里面。
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

describe("buildRunCaseEventRows（自动化接管人工结论）", () => {
	it("结论没变时，手工路径即便快照带着 manual 也不记（回归保护）", () => {
		// 手工批量那条 SELECT 结构上带着 executedVia，但它不传开关。
		// 少了这道保护，「一键全部通过」扫过一批人工判过的行会凭空多出
		// 一串 passed → passed——正是丢弃规则当初要挡的东西。
		expect(
			buildRunCaseEventRows({
				actorId: ZHANG,
				snapshots: [
					snapshot({ executedVia: "manual", id: CASE_A, result: "passed" }),
					snapshot({
						comment: "手点的说明",
						executedVia: "manual",
						id: CASE_B,
						result: "passed",
					}),
				],
				toResult: "passed",
			})
		).toEqual([]);
	});

	it("自动化顶掉人工结论时照记一行，说明是被覆盖掉的那一段", () => {
		// 张三判 failed 写「支付网关 502」，脚本带 overwriteManual 报同样的 failed：
		// 结论没变，但张三那句说明被脚本的 message 顶掉了，不留痕就永久消失。
		expect(
			buildRunCaseEventRows({
				actorId: LI,
				automationTakeover: true,
				comment: "assert timeout at checkout.spec.ts:42",
				snapshots: [
					snapshot({
						comment: "支付网关 502，联系运维了",
						executedVia: "manual",
						result: "failed",
					}),
				],
				toResult: "failed",
			})
		).toEqual([
			{
				actorId: LI,
				comment: "支付网关 502，联系运维了",
				// 结论确实没变，这一行如实记 failed → failed，不造假来源结论。
				fromResult: "failed",
				runCaseId: CASE_A,
				toResult: "failed",
			},
		]);
	});

	it("自动化重跑出同样结论不记（旧来源已是 automation，什么都没被顶掉）", () => {
		expect(
			buildRunCaseEventRows({
				actorId: LI,
				automationTakeover: true,
				comment: "assert timeout at checkout.spec.ts:42",
				snapshots: [
					snapshot({
						comment: "assert timeout at checkout.spec.ts:42",
						executedVia: "automation",
						result: "failed",
					}),
				],
				toResult: "failed",
			})
		).toEqual([]);
	});

	it("从没打过结论的行（来源为空）被自动化写上同样结论也不记", () => {
		expect(
			buildRunCaseEventRows({
				actorId: LI,
				automationTakeover: true,
				comment: "脚本的说明",
				snapshots: [
					snapshot({ comment: null, executedVia: null, result: "passed" }),
				],
				toResult: "passed",
			})
		).toEqual([]);
	});

	it("自动化把结论改掉时照旧记，说明仍是脚本这次写的那段", () => {
		expect(
			buildRunCaseEventRows({
				actorId: LI,
				automationTakeover: true,
				comment: "assert timeout at checkout.spec.ts:42",
				snapshots: [
					snapshot({
						comment: "上一轮是过的",
						executedVia: "manual",
						result: "passed",
					}),
				],
				toResult: "failed",
			})
		).toEqual([
			{
				actorId: LI,
				comment: "assert timeout at checkout.spec.ts:42",
				fromResult: "passed",
				runCaseId: CASE_A,
				toResult: "failed",
			},
		]);
	});

	it("同一批里接管与变更混着来，各按各的规则记", () => {
		const rows = buildRunCaseEventRows({
			actorId: LI,
			automationTakeover: true,
			comment: "脚本的说明",
			snapshots: [
				snapshot({
					comment: "人写的理由",
					executedVia: "manual",
					id: CASE_A,
					result: "failed",
				}),
				snapshot({ executedVia: "automation", id: CASE_B, result: "failed" }),
				snapshot({ executedVia: "manual", id: CASE_C, result: "passed" }),
			],
			toResult: "failed",
		});
		expect(rows).toEqual([
			{
				actorId: LI,
				comment: "人写的理由",
				fromResult: "failed",
				runCaseId: CASE_A,
				toResult: "failed",
			},
			{
				actorId: LI,
				comment: "脚本的说明",
				fromResult: "passed",
				runCaseId: CASE_C,
				toResult: "failed",
			},
		]);
	});
});
