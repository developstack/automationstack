import { changeCaseStatusByFilter } from "@automationstack/db/repositories/case-filter-batch-repository";
import {
	type CaseStatusChange,
	changeCaseStatus,
} from "@automationstack/db/repositories/case-mutations-repository";
import type { z } from "zod";

import { protectedProcedure } from "../index";
import { onlyValue } from "../lib/only-value";
import { requireCasesMember, toCasesScope } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	changeCaseStatusInputSchema,
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_FILTER_BATCH_CASES,
} from "../schemas/case";

type ChangeCaseStatusInput = z.infer<typeof changeCaseStatusInputSchema>;

/** 写入的结果：修改的用例，或不能修改的原因（转为 NOT_FOUND 或 BAD_REQUEST）。 */
type StatusWrite =
	| { changes: CaseStatusChange[]; kind: "ok" }
	| { kind: "not-found" }
	| { kind: "too-many" };

function writeStatus(
	input: ChangeCaseStatusInput,
	actorName: string | null
): Promise<StatusWrite> {
	if ("filter" in input) {
		return changeCaseStatusByFilter({
			actorName,
			filter: input.filter,
			limit: MAX_FILTER_BATCH_CASES,
			status: input.status,
		});
	}
	return changeCaseStatus({
		actorName,
		caseIds: input.ids,
		status: input.status,
	});
}

export const caseStatusProcedures = {
	/**
	 * 只改用例状态。不检查版本，状态变化的每条用例记录一个新版本。
	 * 用例表格中改一条用例的状态时传一个 id；批量修改状态传多个 id；
	 * 选择了全部符合筛选的用例时传筛选条件，由服务端找出现在符合筛选的用例。
	 */
	changeStatus: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(changeCaseStatusInputSchema)
		.use(requireCasesMember, toCasesScope)
		.handler(async ({ context, errors, input }) => {
			const result = await writeStatus(input, context.actor?.name ?? null);
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			if (result.kind === "too-many") {
				throw errors.BAD_REQUEST({ message: FILTER_BATCH_TOO_MANY_MESSAGE });
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
