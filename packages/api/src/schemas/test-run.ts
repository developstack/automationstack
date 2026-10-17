import { z } from "zod";

export const testRunStatusSchema = z.enum([
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
	"voided",
]);

export const testRunCaseResultSchema = z.enum([
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

export const runIdSchema = z.object({ runId: z.uuid() });

export const VOID_REASON_MAX_LENGTH = 500;

/** 作废测试任务的输入。原因选填：空白的原因记为 null。 */
export const voidTestRunSchema = z.object({
	reason: z
		.string()
		.trim()
		.max(VOID_REASON_MAX_LENGTH)
		.nullable()
		.optional()
		.transform((reason) => reason || null),
	runId: z.uuid(),
});

export const testRunStepResultSchema = z.enum([
	"passed",
	"failed",
	"blocked",
	"skipped",
]);
