/**
 * 登记阶段的作用域折算。
 *
 * 与 `../project-access.test.ts` 同一个理由要测：授权代码的失效方式是
 * 「多放行了一个」——既不抛异常也不让 tsc 变红。这一条尤其隐蔽，因为它的
 * 「放行」不是返回 true，而是**把某一组悄悄留在 allowed 里**。
 *
 * 三件事必须钉死：该拒的整组都进对账单（不能只拒组里第一条）、
 * 该放的原样放行、以及查不到归属（既不在禁止集也不该假装允许）的组必须
 * **原样流下去**——那一条是 `forbiddenRunIds` 的取舍在这里的落点，
 * 写反了就会把「任务不存在」误报成「你不是成员」。
 */
import { describe, expect, it } from "vitest";

import type { AttachmentRegisterGroup } from "./attachment-register-plan";
import {
	REASON_PROJECT_FORBIDDEN,
	splitRegisterGroupsByAccess,
} from "./attachment-register-scope";

const RUN_ALLOWED = "11111111-1111-4111-8111-111111111111";
const RUN_FORBIDDEN = "22222222-2222-4222-8222-222222222222";
const RUN_UNKNOWN = "33333333-3333-4333-8333-333333333333";

function group(runId: string, indexes: number[]): AttachmentRegisterGroup {
	return {
		items: indexes.map((index) => ({
			fileName: `shot-${index}.png`,
			index,
			kind: "screenshot" as const,
			runCaseId: `44444444-4444-4444-8444-44444444444${index}`,
			runId,
			storageKey: `runs/${runId}/${index}.png`,
		})),
		runId,
	};
}

describe("splitRegisterGroupsByAccess", () => {
	it("禁止集里的任务整组进对账单，一条都不漏", () => {
		const split = splitRegisterGroupsByAccess(
			[group(RUN_FORBIDDEN, [0, 1, 2])],
			new Set([RUN_FORBIDDEN])
		);
		expect(split.allowed).toEqual([]);
		expect(split.rejected.map((item) => item.index)).toEqual([0, 1, 2]);
	});

	it("被拒条目带着定位信息与理由，上报方看得出是权限问题", () => {
		const split = splitRegisterGroupsByAccess(
			[group(RUN_FORBIDDEN, [7])],
			new Set([RUN_FORBIDDEN])
		);
		expect(split.rejected[0]).toEqual({
			index: 7,
			reason: REASON_PROJECT_FORBIDDEN,
			runCaseId: "44444444-4444-4444-8444-444444444447",
			storageKey: `runs/${RUN_FORBIDDEN}/7.png`,
		});
	});

	it("不在禁止集里的任务原样放行，且不产生任何对账单行", () => {
		const allowed = group(RUN_ALLOWED, [0]);
		const split = splitRegisterGroupsByAccess(
			[allowed],
			new Set([RUN_FORBIDDEN])
		);
		expect(split.allowed).toEqual([allowed]);
		expect(split.rejected).toEqual([]);
	});

	it("查不到归属的任务不算被禁：要留给守卫给出「任务已不存在」那句更准的话", () => {
		const unknown = group(RUN_UNKNOWN, [0]);
		const split = splitRegisterGroupsByAccess([unknown], new Set());
		expect(split.allowed).toEqual([unknown]);
		expect(split.rejected).toEqual([]);
	});

	it("同一批里能拒的拒、能过的过，互不牵连（§5.8 局部失败不让整批失败）", () => {
		const allowed = group(RUN_ALLOWED, [0, 2]);
		const split = splitRegisterGroupsByAccess(
			[allowed, group(RUN_FORBIDDEN, [1])],
			new Set([RUN_FORBIDDEN])
		);
		expect(split.allowed).toEqual([allowed]);
		expect(split.rejected.map((item) => item.index)).toEqual([1]);
	});

	it("空禁止集时一组都不拒——判据缺失绝不能变成默认拒绝", () => {
		const groups = [group(RUN_ALLOWED, [0]), group(RUN_FORBIDDEN, [1])];
		const split = splitRegisterGroupsByAccess(groups, new Set());
		expect(split.allowed).toEqual(groups);
		expect(split.rejected).toEqual([]);
	});
});
