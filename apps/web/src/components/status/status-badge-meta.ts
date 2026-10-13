import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStatus,
} from "@automationstack/db/schema/test-runs";

import type { ChangeKind } from "@/components/versions/change-kind";

export type StatusTone =
	| "danger"
	| "info"
	| "info-outline"
	| "neutral"
	| "outline"
	| "priority"
	| "priority-strong"
	| "solid"
	| "struck"
	| "success"
	| "warning";

// 浅底的文字色用 *-soft-foreground 令牌：直接用状态色作文字，在浅底上达不到 WCAG AA
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
	danger:
		"border-destructive/20 bg-destructive-soft text-destructive-soft-foreground",
	info: "border-info/20 bg-info-soft text-info-soft-foreground",
	"info-outline": "border-info/40 text-info",
	neutral: "bg-muted text-muted-foreground",
	outline: "border-muted-foreground/40 text-muted-foreground",
	priority: "numeric px-0 font-normal text-foreground",
	"priority-strong": "numeric px-0 font-semibold text-foreground",
	solid: "bg-neutral-solid text-neutral-solid-foreground",
	struck: "bg-muted text-muted-foreground line-through",
	success: "border-success/20 bg-success-soft text-success-soft-foreground",
	warning: "border-warning/20 bg-warning-soft text-warning-soft-foreground",
};

export const RESULT_TONES: Record<TestRunCaseResult, StatusTone> = {
	blocked: "warning",
	failed: "danger",
	passed: "success",
	skipped: "neutral",
	untested: "neutral",
};

export const RUN_STATUS_TONES: Record<TestRunStatus, StatusTone> = {
	completed: "solid",
	in_progress: "info",
	pending_review: "outline",
	ready: "info-outline",
	submitted: "solid",
};

export const CASE_STATUS_TONES: Record<CaseStatus, StatusTone> = {
	active: "success",
	deprecated: "struck",
	draft: "outline",
};

/** 版本对比中一处内容的变化：新增绿、删除红、修改琥珀色、移动浅蓝描边、未变灰。 */
export const CHANGE_TONES: Record<ChangeKind, StatusTone> = {
	added: "success",
	modified: "warning",
	moved: "info-outline",
	removed: "danger",
	unchanged: "neutral",
};

/** 圆环图等放不下标签的图形，用这组状态色表示用例状态。旁边的图例使用统一状态标签。 */
export const CASE_STATUS_CHART_COLORS: Record<CaseStatus, string> = {
	active: "var(--success)",
	deprecated: "var(--result-skipped)",
	draft: "var(--muted-foreground)",
};

export function isStrongPriority(priority: CasePriority): boolean {
	return priority === "P0";
}

export function priorityTone(priority: CasePriority): StatusTone {
	return isStrongPriority(priority) ? "priority-strong" : "priority";
}
