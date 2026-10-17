import {
	type RemoveTestCasesByFilterResult,
	removeTestCasesByFilter,
} from "@automationstack/db/repositories/case-filter-batch-repository";
import { removeTestCases } from "@automationstack/db/repositories/test-cases-repository";
import type { z } from "zod";

import { protectedProcedure } from "../index";
import { onlyValue } from "../lib/only-value";
import { requireExistingCasesMember, toCasesScope } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_FILTER_BATCH_CASES,
	removeCasesInputSchema,
} from "../schemas/case";

type RemoveCasesInput = z.infer<typeof removeCasesInputSchema>;

/** 删除勾选的用例或全部符合筛选的用例。符合筛选的用例超过上限时返回 too-many（转为 BAD_REQUEST）。 */
async function writeRemove(
	input: RemoveCasesInput,
	projectId: string
): Promise<RemoveTestCasesByFilterResult> {
	if ("filter" in input) {
		return removeTestCasesByFilter({
			filter: input.filter,
			limit: MAX_FILTER_BATCH_CASES,
		});
	}
	const result = await removeTestCases({ caseIds: input.ids, projectId });
	return { kind: "ok", ...result };
}

export const caseRemoveProcedures = {
	/**
	 * 批量删除用例，一个请求、一个事务。权限与删除一条用例相同：项目里任何成员都可以。
	 * 传勾选的用例 id，或传筛选条件（选择了全部符合筛选的用例，由服务端找出现在符合筛选的用例）。
	 * 被测试任务用到的用例跳过（测试任务不能删除，这些用例只能改为废弃，见 ADR 0004）。
	 * 不存在的用例（例如已被别人删除）当作已经删除，在 missingIds 中报告，不让整批失败。
	 * 与删除一条用例一样，不删除 R2 中的步骤截图文件。
	 */
	removeMany: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(removeCasesInputSchema)
		.use(requireExistingCasesMember, toCasesScope)
		.handler(async ({ context, errors, input }) => {
			if (context.casesProjectId === null) {
				return {
					deleted: [],
					missingIds: "ids" in input ? [...new Set(input.ids)] : [],
					skipped: [],
				};
			}
			const result = await writeRemove(input, context.casesProjectId);
			if (result.kind === "too-many") {
				throw errors.BAD_REQUEST({ message: FILTER_BATCH_TOO_MANY_MESSAGE });
			}
			if (result.removed.length > 0) {
				publishInvalidate({
					action: "delete",
					context,
					entity: "case",
					ids: result.removed.map((testCase) => testCase.id),
					moduleId: onlyValue(
						result.removed.map((testCase) => testCase.moduleId)
					),
					projectId: context.casesProjectId,
				});
			}
			return {
				deleted: result.removed.map(({ id, name }) => ({ id, name })),
				missingIds: result.missingIds,
				skipped: result.skipped.map(({ referencedByRunCount, testCase }) => ({
					id: testCase.id,
					name: testCase.name,
					referencedByRunCount,
				})),
			};
		}),
};
