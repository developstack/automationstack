import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

export type ReasonKind = "blocked" | "failed";

export const REASON_FIELD_CLASSES: Record<ReasonKind, string> = {
	blocked: "border-warning/40 text-warning placeholder:text-warning/50",
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
	blocked: "bg-warning-soft text-warning-soft-foreground",
	failed: "bg-destructive-soft text-destructive-soft-foreground",
};

export function reasonKindOf(
	result: TestRunStepResult | undefined
): ReasonKind | null {
	if (result === undefined || !stepNeedsComment(result)) {
		return null;
	}
	return result === "failed" ? "failed" : "blocked";
}
