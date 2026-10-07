import { saveRunCaseStepResults } from "@automationstack/db/repositories/test-run-step-verdicts-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRunCaseMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	REVIEW_PENDING_MESSAGE,
	rejectRunWrite,
	testRunErrors,
} from "../lib/test-run-errors";
import { testRunStepResultSchema } from "../schemas/test-run";

const stepVerdictSchema = z.object({
	comment: z.string().nullable(),
	result: testRunStepResultSchema,
	stepId: z.string().min(1),
});

const saveStepResultsSchema = z.object({
	caseVersion: z.number().int().positive(),
	runCaseId: z.uuid(),
	steps: z
		.array(stepVerdictSchema)
		.refine(
			(steps) =>
				new Set(steps.map((step) => step.stepId)).size === steps.length,
			{ message: "同一个步骤不能提交两次判定" }
		),
});

type StepVerdict = z.infer<typeof stepVerdictSchema>;

function splitStepVerdicts(steps: StepVerdict[]) {
	return {
		comments: Object.fromEntries(
			steps
				.filter((step) => step.comment !== null)
				.map((step) => [step.stepId, step.comment as string])
		),
		judged: Object.fromEntries(steps.map((step) => [step.stepId, step.result])),
	};
}

export const testRunStepExecutionProcedures = {
	saveStepResults: protectedProcedure
		.errors(testRunErrors)
		.input(saveStepResultsSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }) => {
			const result = await saveRunCaseStepResults({
				actorId: context.user.id,
				caseVersion: input.caseVersion,
				...splitStepVerdicts(input.steps),
				runCaseId: input.runCaseId,
			});
			if (result.kind === "review-pending") {
				throw errors.CONFLICT({ message: REVIEW_PENDING_MESSAGE });
			}
			if (result.kind === "case-changed") {
				throw errors.CONFLICT({
					message: `用例已被改到 v${result.currentVersion}，请刷新后对着新步骤重新判定（你刚才的判定仍留在本机草稿里）`,
				});
			}
			if (result.kind === "no-steps") {
				throw errors.BAD_REQUEST({
					message: "该用例没有步骤，请直接给整条用例打结论",
				});
			}
			if (result.kind === "unknown-steps") {
				throw errors.BAD_REQUEST({
					message: `以下步骤不属于该用例：${result.stepIds.join("、")}`,
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
};
