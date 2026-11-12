import {
	listCaseIdsByFilter,
	type MoveTestCasesByFilterResult,
	moveTestCasesByFilter,
} from "@automationstack/db/repositories/case-filter-batch-repository";
import { moveTestCases } from "@automationstack/db/repositories/case-move-repository";
import { listModuleFollowingRuns } from "@automationstack/db/repositories/run-case-module";
import type { z } from "zod";

import { protectedProcedure } from "../index";
import { requireCasesMember, toCasesScope } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	INVALID_TARGET_MODULE_MESSAGE,
	MAX_FILTER_BATCH_CASES,
	moveCasesInputSchema,
} from "../schemas/case";

type MoveCasesInput = z.infer<typeof moveCasesInputSchema>;

function writeMove(
	input: MoveCasesInput
): Promise<MoveTestCasesByFilterResult> {
	if ("filter" in input) {
		return moveTestCasesByFilter({
			filter: input.filter,
			limit: MAX_FILTER_BATCH_CASES,
			moduleId: input.moduleId,
		});
	}
	return moveTestCases({ caseIds: input.ids, moduleId: input.moduleId });
}

/** 要移动的用例 id。符合筛选的用例超过上限时为 null。 */
function targetCaseIds(input: MoveCasesInput): Promise<string[] | null> {
	if ("filter" in input) {
		return listCaseIdsByFilter({
			filter: input.filter,
			limit: MAX_FILTER_BATCH_CASES,
		});
	}
	return Promise.resolve(input.ids);
}

function brief({ id, name }: { id: string; name: string }) {
	return { id, name };
}

export const caseMoveProcedures = {
	/**
	 * 移动前的预览：把这些用例移到 moduleId 时，模块会跟着改的测试任务（待评审、待测试、测试中，ADR 0009）。
	 * 页面在确认移动前用它提示用户。已完成、已提交和已作废的测试任务不改，不列出。
	 */
	moveImpact: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(moveCasesInputSchema)
		.use(requireCasesMember, toCasesScope)
		.handler(async ({ errors, input }) => {
			const caseIds = await targetCaseIds(input);
			if (caseIds === null) {
				throw errors.BAD_REQUEST({ message: FILTER_BATCH_TOO_MANY_MESSAGE });
			}
			return { runs: await listModuleFollowingRuns(caseIds, input.moduleId) };
		}),

	/**
	 * 把用例移到另一个模块的最后，一个请求、一个事务。权限与移动一条用例相同：项目里任何成员都可以。
	 * 传勾选的用例 id，或传筛选条件（选择了全部符合筛选的用例，由服务端找出现在符合筛选的用例）。
	 * 已经在目标模块中的用例不动，在 unchanged 中报告；不存在的用例在 missingIds 中报告。
	 * 待评审、待测试和测试中的测试任务里，这些用例的模块跟着改，在 syncedRunIds 中报告（ADR 0009）。
	 */
	moveMany: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(moveCasesInputSchema)
		.use(requireCasesMember, toCasesScope)
		.handler(async ({ context, errors, input }) => {
			const result = await writeMove(input);
			if (result.kind === "too-many") {
				throw errors.BAD_REQUEST({ message: FILTER_BATCH_TOO_MANY_MESSAGE });
			}
			if (result.kind === "invalid-module") {
				throw errors.BAD_REQUEST({ message: INVALID_TARGET_MODULE_MESSAGE });
			}
			const [first] = result.moved;
			if (first !== undefined) {
				publishInvalidate({
					action: "move",
					context,
					entity: "case",
					ids: result.moved.map((testCase) => testCase.id),
					moduleId: input.moduleId,
					projectId: first.projectId,
				});
			}
			if (first !== undefined && result.syncedRunIds.length > 0) {
				publishInvalidate({
					action: "update",
					context,
					entity: "testRun",
					ids: result.syncedRunIds,
					projectId: first.projectId,
				});
			}
			return {
				missingIds: result.missingIds,
				moved: result.moved.map(brief),
				syncedRunIds: result.syncedRunIds,
				unchanged: result.unchanged.map(brief),
			};
		}),
};
