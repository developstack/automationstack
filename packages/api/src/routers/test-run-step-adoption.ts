import {
	adoptActualAsExpected,
	findStepAdoptionSource,
} from "@automationstack/db/repositories/test-run-step-adoption-repository";
import type { TestCase } from "@automationstack/db/schema/test-cases";
import type { TestRun } from "@automationstack/db/schema/test-runs";
import { z } from "zod";

import type { Context } from "../context";

import { protectedProcedure } from "../index";
import { getObjectStorage } from "../lib/object-storage";
import { requireRunCaseMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	copyStepImagesToCase,
	removeCopiedImages,
} from "../lib/step-adoption-images";
import { rejectRunWrite, testRunErrors } from "../lib/test-run-errors";
import {
	saveStepResultsSchema,
	splitStepVerdicts,
	throwStepVerdictRejection,
} from "./test-run-step-execution";

/** 保存判定的输入，加上实际结果被设为预期结果的步骤。 */
const adoptActualAsExpectedSchema = saveStepResultsSchema.extend({
	stepId: z.string().min(1),
});

/** 测试任务和用例都改变了，所以通知两种页面刷新。 */
function publishAdoption(
	context: Context,
	run: TestRun,
	testCase: TestCase
): void {
	publishInvalidate({
		action: "update",
		context,
		entity: "testRun",
		ids: [run.id],
		projectId: run.projectId,
	});
	publishInvalidate({
		action: "update",
		context,
		entity: "case",
		ids: [testCase.id],
		moduleId: testCase.moduleId,
		projectId: testCase.projectId,
	});
}

export const testRunStepAdoptionProcedures = {
	/**
	 * 设为预期结果：一个步骤的实际结果（文字和图片）写成用例中这个步骤的预期结果，生成新的用例版本；
	 * 这个步骤判定为通过，其他步骤的判定和实际结果一起保存。规则与保存判定相同。
	 */
	adoptActualAsExpected: protectedProcedure
		.errors(testRunErrors)
		.input(adoptActualAsExpectedSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }) => {
			const source = await findStepAdoptionSource(
				input.runCaseId,
				input.stepId
			);
			if (source === null) {
				rejectRunWrite({ kind: "not-found" }, errors);
			}
			const storage = await getObjectStorage();
			const copies = await copyStepImagesToCase(storage, source);
			const result = await adoptActualAsExpected({
				actorId: context.user.id,
				actorName: context.actor?.name ?? null,
				caseVersion: input.caseVersion,
				...splitStepVerdicts(input.steps),
				images: copies.images,
				runCaseId: input.runCaseId,
				stepId: input.stepId,
			});
			if (result.kind !== "ok") {
				await removeCopiedImages(storage, copies.images);
			}
			if (result.kind === "no-actual-result") {
				throw errors.BAD_REQUEST({
					message: "这个步骤没有实际结果的文字或图片，不能设为预期结果",
				});
			}
			if (result.kind !== "ok") {
				throwStepVerdictRejection(result, errors);
			}
			const { run, runCase, stepNumber, testCase } = result;
			publishAdoption(context, run, testCase);
			return {
				caseVersion: testCase.currentVersion,
				run,
				runCase,
				skippedAttachments: copies.skipped,
				stepNumber,
			};
		}),
};
