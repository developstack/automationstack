import { removeTestCases } from "@automationstack/db/repositories/test-cases-repository";

import { protectedProcedure } from "../index";
import { onlyValue } from "../lib/only-value";
import { requireExistingCasesMember, toCasesScope } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import { removeCasesSchema } from "../schemas/case";

export const caseRemoveProcedures = {
	/**
	 * 批量删除用例，一个请求、一个事务。权限与删除一条用例相同：项目里任何成员都可以。
	 * 被测试任务用到的用例跳过（测试任务不能删除，这些用例只能改为废弃，见 ADR 0004）。
	 * 不存在的用例（例如已被别人删除）当作已经删除，在 missingIds 中报告，不让整批失败。
	 * 与删除一条用例一样，不删除 R2 中的步骤截图文件。
	 */
	removeMany: protectedProcedure
		.input(removeCasesSchema)
		.use(requireExistingCasesMember, toCasesScope)
		.handler(async ({ context, input }) => {
			if (context.casesProjectId === null) {
				return {
					deleted: [],
					missingIds: [...new Set(input.ids)],
					skipped: [],
				};
			}
			const result = await removeTestCases({
				caseIds: input.ids,
				projectId: context.casesProjectId,
			});
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
