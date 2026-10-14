import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import type { TagObj } from "mind-elixir";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import {
	CASE_STATUS_TONES,
	priorityTone,
	type StatusTone,
} from "@/components/status/status-badge-meta";

type TagStyle = Record<string, string>;

/** 与 Tailwind 的 `/20` 等不透明度写法相同：在 oklab 中与透明色混合。 */
function tint(token: string, percent: number): string {
	return `color-mix(in oklab, var(${token}) ${percent}%, transparent)`;
}

const BORDER_TINT_PERCENT = 20;
const OUTLINE_TINT_PERCENT = 40;

/**
 * 脑图节点的标签由 mind-elixir 渲染，它的样式表不在 Tailwind 的层中，会盖住工具类，
 * 所以标签用行内样式。每种样式与 STATUS_TONE_CLASSES 一一对应，颜色只引用令牌。
 */
const TONE_STYLES: Record<StatusTone, TagStyle> = {
	danger: {
		background: "var(--destructive-soft)",
		borderColor: tint("--destructive", BORDER_TINT_PERCENT),
		color: "var(--destructive-soft-foreground)",
	},
	info: {
		background: "var(--info-soft)",
		borderColor: tint("--info", BORDER_TINT_PERCENT),
		color: "var(--info-soft-foreground)",
	},
	"info-outline": {
		background: "transparent",
		borderColor: tint("--info", OUTLINE_TINT_PERCENT),
		color: "var(--info)",
	},
	neutral: {
		background: "var(--muted)",
		borderColor: "transparent",
		color: "var(--muted-foreground)",
	},
	outline: {
		background: "transparent",
		borderColor: tint("--muted-foreground", OUTLINE_TINT_PERCENT),
		color: "var(--muted-foreground)",
	},
	// 和 StatusBadge 的 font-normal、font-semibold 一致
	priority: {
		background: "transparent",
		borderColor: "transparent",
		color: "var(--foreground)",
		fontFamily: "var(--font-mono)",
		fontWeight: "400",
		paddingInline: "0",
	},
	"priority-strong": {
		background: "transparent",
		borderColor: "transparent",
		color: "var(--foreground)",
		fontFamily: "var(--font-mono)",
		fontWeight: "600",
		paddingInline: "0",
	},
	solid: {
		background: "var(--neutral-solid)",
		borderColor: "transparent",
		color: "var(--neutral-solid-foreground)",
	},
	struck: {
		background: "var(--muted)",
		borderColor: "transparent",
		color: "var(--muted-foreground)",
		textDecoration: "line-through",
	},
	success: {
		background: "var(--success-soft)",
		borderColor: tint("--success", BORDER_TINT_PERCENT),
		color: "var(--success-soft-foreground)",
	},
	warning: {
		background: "var(--warning-soft)",
		borderColor: tint("--warning", BORDER_TINT_PERCENT),
		color: "var(--warning-soft-foreground)",
	},
};

/** 按 StatusBadge 的一种样式生成标签。 */
export function buildToneTag(text: string, tone: StatusTone): TagObj {
	return { style: { ...TONE_STYLES[tone] }, text };
}

/** 用例状态标签，与 StatusBadge kind="caseStatus" 的文字和样式相同。 */
export function buildCaseStatusTag(status: CaseStatus): TagObj {
	return buildToneTag(STATUS_LABELS[status], CASE_STATUS_TONES[status]);
}

/** 优先级标签，与 StatusBadge kind="priority" 相同：不用颜色，等宽字体，只有 P0 加粗。 */
export function buildPriorityTag(priority: CasePriority): TagObj {
	return buildToneTag(priority, priorityTone(priority));
}

/** 用例节点的标签：先用例状态，后优先级，顺序与用例详情的头部相同。 */
export function buildCaseTags(
	status: CaseStatus,
	priority: CasePriority
): TagObj[] {
	return [buildCaseStatusTag(status), buildPriorityTag(priority)];
}
