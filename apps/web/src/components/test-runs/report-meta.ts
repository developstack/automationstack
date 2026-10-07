import type { AppRouterClient } from "@automationstack/api/routers/index";
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

export type TestRunReportView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["report"]>
>;

export type ReportModuleStat = TestRunReportView["modules"][number];
export type ReportPriorityStat = TestRunReportView["priorities"][number];
export type ReportFailedCase = TestRunReportView["failedCases"][number];

export const CONCLUDED_RESULTS: readonly TestRunCaseResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export const RESULT_CHART_COLORS: Record<
	TestRunCaseResult,
	{ color: string; swatch: string }
> = {
	blocked: { color: "var(--result-blocked)", swatch: "bg-result-blocked" },
	failed: { color: "var(--result-failed)", swatch: "bg-result-failed" },
	passed: { color: "var(--result-passed)", swatch: "bg-result-passed" },
	skipped: { color: "var(--result-skipped)", swatch: "bg-result-skipped" },
	untested: { color: "var(--chart-1)", swatch: "bg-chart-1" },
};

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeHttpUrl(value: string | null): boolean {
	if (value === null || value === "") {
		return false;
	}
	try {
		return SAFE_URL_PROTOCOLS.has(new URL(value).protocol);
	} catch {
		return false;
	}
}

const AUTO_SUBMIT_DATE_FORMAT = new Intl.DateTimeFormat("zh-CN", {
	dateStyle: "long",
});

export function formatAutoSubmitDate(value: Date | string): string {
	return AUTO_SUBMIT_DATE_FORMAT.format(new Date(value));
}
