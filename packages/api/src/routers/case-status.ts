import { changeCaseStatusByFilter } from "@automationstack/db/repositories/case-filter-batch-repository";
import {
	type CaseStatusChange,
	changeCaseStatus,
} from "@automationstack/db/repositories/case-mutations-repository";
import { undoCaseStatusChange } from "@automationstack/db/repositories/case-status-undo-repository";
import { env } from "@automationstack/env/server";
import type { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
	caseStatusUndoOf,
	readCaseStatusUndoToken,
	signCaseStatusUndoToken,
} from "../lib/case-status-undo-token";
import { onlyValue } from "../lib/only-value";
import {
	requireCasesMember,
	requireProjectMember,
	toCasesScope,
} from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	CASE_STATUS_UNDO_EXPIRED_MESSAGE,
	changeCaseStatusInputSchema,
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_FILTER_BATCH_CASES,
	undoCaseStatusChangeSchema,
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

/** 通知其他人刷新状态有变化的用例。修改和撤销都用。 */
function publishStatusChanges(
	context: Context,
	changes: readonly CaseStatusChange[]
): void {
	const written = changes
		.filter((change) => change.version !== null)
		.map((change) => change.testCase);
	const [first] = written;
	if (first === undefined) {
		return;
	}
	publishInvalidate({
		action: "update",
		context,
		entity: "case",
		ids: written.map((testCase) => testCase.id),
		moduleId: onlyValue(written.map((testCase) => testCase.moduleId)),
		projectId: first.projectId,
	});
}

export const caseStatusProcedures = {
	/**
	 * 只改用例状态。不检查版本，状态变化的每条用例记录一个新版本。
	 * 用例表格中改一条用例的状态时传一个 id；批量修改状态传多个 id；
	 * 选择了全部符合筛选的用例时传筛选条件，由服务端找出现在符合筛选的用例。
	 * 有用例的状态变化时返回撤销凭证（undoToken），用于 cases.undoStatusChange；否则为 null。
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
			publishStatusChanges(context, result.changes);
			const undo = caseStatusUndoOf(result.changes, {
				status: input.status,
				userId: context.user.id,
			});
			const undoToken =
				undo === null
					? null
					: await signCaseStatusUndoToken(undo, {
							now: Date.now(),
							secret: env.SESSION_SECRET,
						});
			return { changes: result.changes, undoToken };
		}),

	/**
	 * 撤销一次 cases.changeStatus：凭修改时返回的撤销凭证，把改过的用例恢复为各自原来的状态，
	 * 一个事务，每条恢复的用例记录一个新版本。只有修改的用户在凭证过期前可以撤销，并且现在还
	 * 可以进入这个项目。修改后又被改过的用例不动，在 skippedIds 中报告。
	 */
	undoStatusChange: protectedProcedure
		.errors({ BAD_REQUEST: {}, FORBIDDEN: {} })
		.input(undoCaseStatusChangeSchema)
		.handler(async ({ context, errors, input }) => {
			const read = await readCaseStatusUndoToken(input.token, {
				now: Date.now(),
				secret: env.SESSION_SECRET,
			});
			if (read.kind === "invalid") {
				throw errors.BAD_REQUEST({ message: "撤销凭证无效" });
			}
			if (read.kind === "expired") {
				throw errors.BAD_REQUEST({ message: CASE_STATUS_UNDO_EXPIRED_MESSAGE });
			}
			const { userId, ...undo } = read.undo;
			if (userId !== context.user.id) {
				throw errors.FORBIDDEN({ message: "只能撤销自己的修改" });
			}
			await requireProjectMember(context, undo.projectId);
			const result = await undoCaseStatusChange({
				...undo,
				actorName: context.actor?.name ?? null,
			});
			publishStatusChanges(context, result.changes);
			return result;
		}),
};
