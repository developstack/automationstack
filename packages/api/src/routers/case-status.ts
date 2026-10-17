import { changeCaseStatus } from "@automationstack/db/repositories/case-mutations-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireCasesMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import { caseStatusSchema } from "../schemas/case";

/** 一次最多修改状态的用例数，与用例列表一页的上限相同。 */
const MAX_STATUS_CHANGE_CASES = 100;

const changeCaseStatusSchema = z.object({
	ids: z.array(z.uuid()).min(1).max(MAX_STATUS_CHANGE_CASES),
	status: caseStatusSchema,
});

const toCasesScope = (input: { ids: string[] }) => ({ caseIds: input.ids });

function onlyValue(values: readonly string[]): string | undefined {
	const distinct = [...new Set(values)];
	return distinct.length === 1 ? distinct[0] : undefined;
}

export const caseStatusProcedures = {
	/**
	 * 只改用例状态。不检查版本，状态变化的每条用例记录一个新版本。
	 * 用例表格中改一条用例的状态时传一个 id；批量修改状态传多个 id。
	 */
	changeStatus: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(changeCaseStatusSchema)
		.use(requireCasesMember, toCasesScope)
		.handler(async ({ context, errors, input }) => {
			const result = await changeCaseStatus({
				actorName: context.actor?.name ?? null,
				caseIds: input.ids,
				status: input.status,
			});
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			const written = result.changes
				.filter((change) => change.version !== null)
				.map((change) => change.testCase);
			const [first] = written;
			if (first !== undefined) {
				publishInvalidate({
					action: "update",
					context,
					entity: "case",
					ids: written.map((testCase) => testCase.id),
					moduleId: onlyValue(written.map((testCase) => testCase.moduleId)),
					projectId: first.projectId,
				});
			}
			return { changes: result.changes };
		}),
};
