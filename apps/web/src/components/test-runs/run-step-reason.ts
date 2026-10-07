import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

export type ReasonKind = "blocked" | "failed";

export const REASON_FIELD_CLASSES: Record<ReasonKind, string> = {
	blocked:
		"border-amber-600/40 text-amber-700 placeholder:text-amber-700/50 dark:border-amber-400/40 dark:text-amber-300 dark:placeholder:text-amber-300/50",
	failed:
		"border-destructive/40 text-destructive placeholder:text-destructive/50",
};

export const REASON_FIELD_TEXT: Record<
	ReasonKind,
	{ label: string; placeholder: string }
> = {
	blocked: {
		label: "阻塞原因",
		placeholder: "卡在哪、缺什么环境或数据，解开后才知道从哪接着测",
	},
	failed: {
		label: "失败原因",
		placeholder: "实际现象与复现路径，这段会汇总进用例说明并带进 Jira",
	},
};

export const REASON_NOTE_CLASSES: Record<ReasonKind, string> = {
	blocked: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	failed: "bg-destructive/10 text-destructive",
};

export function reasonKindOf(
	result: TestRunStepResult | undefined
): ReasonKind | null {
	if (result === undefined || !stepNeedsComment(result)) {
		return null;
	}
	return result === "failed" ? "failed" : "blocked";
}
