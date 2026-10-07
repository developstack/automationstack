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
import { requireRunCaseMember, requireRunMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	REVIEW_PENDING_MESSAGE,
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
	assigneeId: z.uuid().nullable(),
	runCaseIds: z.array(z.uuid()).min(1),
	runId: z.uuid(),
});

const setResultSchema = z.object({
	comment: z.string().nullable().optional(),
	result: testRunCaseResultSchema,
	runCaseId: z.uuid(),
});

const bulkSetResultSchema = z.object({
	result: testRunCaseResultSchema,
	runCaseIds: z.array(z.uuid()).min(1),
	runId: z.uuid(),
});

function rejectInvalidRunCases(
	invalidRunCaseIds: string[],
	errors: TestRunErrorThrowers
): never {
	throw errors.BAD_REQUEST({
		message: `以下用例不属于该测试任务：${invalidRunCaseIds.join("、")}`,
	});
}

export const testRunExecutionProcedures = {
	addCases: protectedProcedure
		.errors(testRunErrors)
		.input(addCasesSchema)
		.use(requireRunMember)
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
		.use(requireRunMember)
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
		.use(requireRunMember)
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
		.use(requireRunMember)
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
		.use(requireRunCaseMember)
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
