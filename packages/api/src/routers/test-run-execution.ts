import {
	addCasesToRun,
	assignRunCases,
	removeRunCases,
} from "@automationstack/db/repositories/test-run-cases-repository";
import {
	bulkSetRunCaseResult,
	setRunCaseResult,
} from "@automationstack/db/repositories/test-run-verdicts-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	rejectRunWrite,
	type TestRunErrorThrowers,
	testRunErrors,
} from "../lib/test-run-errors";
import { testRunCaseResultSchema } from "../schemas/test-run";

const addCasesSchema = z.object({
	caseIds: z.array(z.uuid()).min(1),
	runId: z.uuid(),
});

const removeCasesSchema = z.object({
	runCaseIds: z.array(z.uuid()).min(1),
	runId: z.uuid(),
});

const assignSchema = z.object({
	/** null = 取消指派。 */
	assigneeId: z.uuid().nullable(),
	runCaseIds: z.array(z.uuid()).min(1),
	/**
	 * plan §4 的签名里没有这个字段，这里补上是为了让整批 run_case 只锁一个测试任务：
	 * 不带 runId 就得先反查这批行属于哪些测试任务，再按 id 序逐个加锁才不会死锁，
	 * 而执行台上的批量操作本来就发生在**一个**测试任务里。多传一个 id 换掉一整套
	 * 跨测试任务加锁逻辑，同时把「越权改到别的测试任务」变成一次显式的 400。
	 */
	runId: z.uuid(),
});

const setResultSchema = z.object({
	/** 失败原因 / 阻塞原因；不传表示不动原有说明，传 null 表示清空。 */
	comment: z.string().nullable().optional(),
	result: testRunCaseResultSchema,
	runCaseId: z.uuid(),
});

const bulkSetResultSchema = z.object({
	result: testRunCaseResultSchema,
	runCaseIds: z.array(z.uuid()).min(1),
	runId: z.uuid(),
});

const REVIEW_PENDING_MESSAGE = "该测试任务尚未评审完成，暂不能打结论";

function rejectInvalidRunCases(
	invalidRunCaseIds: string[],
	errors: TestRunErrorThrowers
): never {
	throw errors.BAD_REQUEST({
		message: `以下用例不属于该测试任务：${invalidRunCaseIds.join("、")}`,
	});
}

/**
 * 执行台上的写操作。**全部只做 zod 校验 + 调 repository + 翻错误码**——
 * 状态推导、行锁、`submitted` 守卫一律在 repository 的事务里，
 * 这里连一次「先查查看能不能改」都不做（那正是 plan §4.2 点名禁止的 TOCTOU）。
 */
export const testRunExecutionProcedures = {
	addCases: protectedProcedure
		.errors(testRunErrors)
		.input(addCasesSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await addCasesToRun({
				actorId: context.user.id,
				caseIds: input.caseIds,
				runId: input.runId,
			});
			if (result.kind === "invalid-cases") {
				throw errors.BAD_REQUEST({
					message: `以下用例不存在或不属于该项目：${result.invalidCaseIds.join("、")}`,
				});
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
	assign: protectedProcedure
		.errors(testRunErrors)
		.input(assignSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await assignRunCases(input);
			if (result.kind === "invalid-run-cases") {
				rejectInvalidRunCases(result.invalidRunCaseIds, errors);
			}
			if (result.kind === "invalid-assignee") {
				throw errors.BAD_REQUEST({ message: "指派的成员不存在" });
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
	bulkSetResult: protectedProcedure
		.errors(testRunErrors)
		.input(bulkSetResultSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await bulkSetRunCaseResult({
				actorId: context.user.id,
				result: input.result,
				runCaseIds: input.runCaseIds,
				runId: input.runId,
				via: "manual",
			});
			if (result.kind === "invalid-run-cases") {
				rejectInvalidRunCases(result.invalidRunCaseIds, errors);
			}
			if (result.kind === "review-pending") {
				throw errors.CONFLICT({ message: REVIEW_PENDING_MESSAGE });
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
	removeCases: protectedProcedure
		.errors(testRunErrors)
		.input(removeCasesSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await removeRunCases({
				actorId: context.user.id,
				runCaseIds: input.runCaseIds,
				runId: input.runId,
			});
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
	setResult: protectedProcedure
		.errors(testRunErrors)
		.input(setResultSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await setRunCaseResult({
				actorId: context.user.id,
				comment: input.comment,
				result: input.result,
				runCaseId: input.runCaseId,
				via: "manual",
			});
			if (result.kind === "review-pending") {
				throw errors.CONFLICT({ message: REVIEW_PENDING_MESSAGE });
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
};
