import { pgEnum } from "drizzle-orm/pg-core";

export const testRunStatusEnum = pgEnum("test_run_status", [
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
]);

export const testRunCaseResultEnum = pgEnum("test_run_case_result", [
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

export const testRunAttachmentKindEnum = pgEnum("test_run_attachment_kind", [
	"screenshot",
	"video",
	"log",
	"other",
]);

export const testRunExecutedViaEnum = pgEnum("test_run_executed_via", [
	"manual",
	"automation",
]);

export type TestRunStatus = (typeof testRunStatusEnum.enumValues)[number];
export type TestRunCaseResult =
	(typeof testRunCaseResultEnum.enumValues)[number];
export type TestRunAttachmentKind =
	(typeof testRunAttachmentKindEnum.enumValues)[number];
export type TestRunExecutedVia =
	(typeof testRunExecutedViaEnum.enumValues)[number];

export type TestRunStepResult = Exclude<TestRunCaseResult, "untested">;

export interface RunCaseStepResult {
	comment: string | null;
	result: TestRunStepResult;
	stepId: string;
}
