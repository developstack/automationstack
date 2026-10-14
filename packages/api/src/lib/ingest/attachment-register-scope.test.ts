import { expect, test } from "vitest";

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

test("禁止集里的任务整组进对账单，一条都不漏，且带着定位信息与权限理由", () => {
	const split = splitRegisterGroupsByAccess(
		[group(RUN_FORBIDDEN, [0, 1, 7])],
		new Set([RUN_FORBIDDEN])
	);
	expect(split.allowed).toEqual([]);
	expect(split.rejected.map((item) => item.index)).toEqual([0, 1, 7]);
	expect(split.rejected[2]).toEqual({
		index: 7,
		reason: REASON_PROJECT_FORBIDDEN,
		runCaseId: "44444444-4444-4444-8444-444444444447",
		storageKey: `runs/${RUN_FORBIDDEN}/7.png`,
	});
});

test.each([
	{
		forbidden: [RUN_FORBIDDEN],
		groups: [group(RUN_ALLOWED, [0])],
		name: "不在禁止集里的任务原样放行，且不产生任何对账单行",
	},
	{
		forbidden: [],
		groups: [group(RUN_UNKNOWN, [0])],
		name: "查不到归属的任务不算被禁：要留给守卫给出「任务已不存在」那句更准的话",
	},
	{
		forbidden: [],
		groups: [group(RUN_ALLOWED, [0]), group(RUN_FORBIDDEN, [1])],
		name: "空禁止集时一组都不拒——判据缺失绝不能变成默认拒绝",
	},
])("$name", ({ forbidden, groups }) => {
	const split = splitRegisterGroupsByAccess(groups, new Set(forbidden));
	expect(split.allowed).toEqual(groups);
	expect(split.rejected).toEqual([]);
});

test("同一批里能拒的拒、能过的过，互不牵连（§5.8 局部失败不让整批失败）", () => {
	const allowed = group(RUN_ALLOWED, [0, 2]);
	const split = splitRegisterGroupsByAccess(
		[allowed, group(RUN_FORBIDDEN, [1])],
		new Set([RUN_FORBIDDEN])
	);
	expect(split.allowed).toEqual([allowed]);
	expect(split.rejected.map((item) => item.index)).toEqual([1]);
});
