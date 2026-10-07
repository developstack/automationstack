import { z } from "zod";

export const testRunStatusSchema = z.enum([
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
]);

export const testRunCaseResultSchema = z.enum([
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

export const runIdSchema = z.object({ runId: z.uuid() });

export const testRunStepResultSchema = z.enum([
	"passed",
	"failed",
	"blocked",
	"skipped",
]);
