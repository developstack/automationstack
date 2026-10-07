import type { AppRouterClient } from "@automationstack/api/routers/index";

type TestRunReportView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["report"]>
>;

export type ReportAutomationExecution =
	TestRunReportView["automationExecutions"][number];

export type ReportOutOfScopeCase = TestRunReportView["outOfScopeCases"][number];

const SHORT_COMMIT_LENGTH = 7;

export function formatCommitShort(commitSha: string | null): string | null {
	if (commitSha === null || commitSha === "") {
		return null;
	}
	return commitSha.slice(0, SHORT_COMMIT_LENGTH);
}

export function formatExecutionCounts(
	execution: Pick<ReportAutomationExecution, "skippedCount" | "updatedCount">
): string {
	return `刷新 ${execution.updatedCount} 条，跳过 ${execution.skippedCount} 条`;
}

export function isExecutionIncomplete(
	execution: Pick<ReportAutomationExecution, "completedAt">
): boolean {
	return execution.completedAt === null;
}
