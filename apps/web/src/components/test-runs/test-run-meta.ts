/**
 * 测试任务执行台共用的展示元数据与权限推导（plan §2）。
 *
 * 刻意留在 apps/web 而不下沉到 packages/ui：`TestRunStatus` / `TestRunCaseResult`
 * 是业务枚举，通用组件不该认识它们——与 `components/cases/case-meta.ts` 同一档。
 */
import type {
	TestRunCaseResult,
	TestRunStatus,
} from "@automationstack/db/schema/test-runs";
import {
	CircleCheckIcon,
	CircleDashedIcon,
	CircleMinusIcon,
	CircleSlashIcon,
	CircleXIcon,
	type LucideIcon,
} from "lucide-react";

import type { BadgeVariant } from "@/components/cases/case-meta";

export const RUN_STATUS_LABELS: Record<TestRunStatus, string> = {
	completed: "已完成",
	in_progress: "测试中",
	pending_review: "待评审",
	ready: "待测试",
	submitted: "已提交",
};

export const RESULT_LABELS: Record<TestRunCaseResult, string> = {
	blocked: "阻塞",
	failed: "失败",
	passed: "通过",
	skipped: "跳过",
	untested: "未测",
};

/**
 * 结论图标：**形状本身就区分五态**（空心虚线 / 对勾 / 叉 / 斜杠 / 减号），
 * 颜色只是加强。这一条是硬要求——结论是这一页唯一要读的信息，
 * 只靠红绿区分会让色觉障碍用户完全读不出「通过」和「失败」的差别。
 * 每处渲染都同时给出图标 + 中文文字，图标本身一律 aria-hidden。
 */
export const RESULT_ICONS: Record<TestRunCaseResult, LucideIcon> = {
	blocked: CircleSlashIcon,
	failed: CircleXIcon,
	passed: CircleCheckIcon,
	skipped: CircleMinusIcon,
	untested: CircleDashedIcon,
};

/** 结论的前景色。与图标形状叠加使用，不单独承担信息。 */
export const RESULT_TEXT_CLASSES: Record<TestRunCaseResult, string> = {
	blocked: "text-amber-600 dark:text-amber-400",
	failed: "text-destructive",
	passed: "text-success",
	skipped: "text-muted-foreground",
	untested: "text-muted-foreground",
};

export const RUN_STATUS_BADGE_VARIANTS: Record<TestRunStatus, BadgeVariant> = {
	completed: "secondary",
	in_progress: "default",
	pending_review: "outline",
	ready: "outline",
	submitted: "ghost",
};

/** 清单左栏的统计顺序：未测在最前，它是「还剩多少活」。 */
export const RESULT_ORDER: readonly TestRunCaseResult[] = [
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
];

/** 可以由人打出来的四种结论（`untested` 是回退，不在这一组里）。 */
export const VERDICT_VALUES: readonly TestRunCaseResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

/**
 * 快捷键 → 结论（plan §7.3）。键面字母同时显示在按钮上，
 * 不做隐藏快捷键：没有可见提示的快捷键等于不存在。
 */
export const VERDICT_SHORTCUT_KEYS: Record<TestRunCaseResult, string> = {
	blocked: "B",
	failed: "F",
	passed: "P",
	skipped: "S",
	untested: "",
};

/**
 * 这条结论是否需要「说明 + 附件 + 缺陷」那三块。
 *
 * 只有**失败**和**阻塞**需要：其余三态（通过 / 跳过 / 未测）打完就完事了，
 * 把三块空控件常驻在下面只会让人每判一条都要略过一遍。规则刻意只有这一条
 * 且三块共用，多一条分支就多一份「这块为什么在、那块为什么不在」的解释成本。
 *
 * 注意这只是「相不相关」。**已经有内容的那块一律照常显示**，判断在各自的
 * 调用点上做（说明看 comment、缺陷看 defectKey/defectUrl、附件看列表长度）：
 * 判过失败又改判通过时，说明 / 附件 / 缺陷在库里都还在（后端只有回退成
 * `untested` 时才清 comment），藏起来等于让人以为数据没了，更糟的是
 * 底下还挂着一个没人知道的未关闭缺陷。
 */
export function needsVerdictDetails(result: TestRunCaseResult): boolean {
	return result === "failed" || result === "blocked";
}

export interface CommentFieldText {
	label: string;
	/** 只在框里是空的时候看得见，所以「历史说明」那一档不给。 */
	placeholder?: string;
}

/**
 * 说明框的 label 与 placeholder：按**当前结论**给准确的词。
 *
 * 不再写「说明（失败原因 / 阻塞原因）」这种两头兼顾的话——那是这个字段常驻
 * 时的妥协，现在它只在一种结论下出现，就该直说是哪一种。
 * 第三档（通过 / 跳过 / 未测）只可能出现在上面说的「已有内容」路径上，
 * 所以文案要写明这段是上一次判失败 / 阻塞时留下的，否则用户会以为
 * 系统在让他给一条「通过」的用例写失败原因。
 */
export function commentFieldText(result: TestRunCaseResult): CommentFieldText {
	if (result === "failed") {
		return {
			label: "失败原因",
			placeholder: "写清楚复现路径与实际现象，这段会带进 Jira issue 的描述里",
		};
	}
	if (result === "blocked") {
		return {
			label: "阻塞原因",
			placeholder: "写清楚卡在哪一步、缺什么环境或数据，解开后才知道从哪接着测",
		};
	}
	return { label: "说明（上次判失败 / 阻塞时留下的）" };
}

export interface RunPermissions {
	/** 能否打/改/回退结论。 */
	canConclude: boolean;
	/** 能否增删测试任务里的用例。 */
	canEditCases: boolean;
	/** 已提交：全只读，所有输入控件禁用。 */
	locked: boolean;
}

/**
 * 状态 → 可做什么（plan §2.2 / §2.5）。
 *
 * 这里最容易做错的一条：**`completed` 不是只读**。`ready` / `in_progress` /
 * `completed` 三态的权限完全相同，改结论、回退结论、追加用例都直接允许，
 * 不加二次确认、不加「重新打开」按钮。任何产生「未测」行的操作，
 * 后端会在同一事务里把测试任务退回 `in_progress`，前端跟着刷新即可。
 *
 * `pending_review` 只差一条：不能打结论（评审还没完成，测了也不算数），
 * 但可以增删用例——那正是评审阶段该干的事。
 *
 * `submitted` 是唯一的只读态，且不可逆：没有任何解锁入口，
 * 要继续测只能新建重测任务（D11）。
 */
export function runPermissions(status: TestRunStatus): RunPermissions {
	if (status === "submitted") {
		return { canConclude: false, canEditCases: false, locked: true };
	}
	return {
		canConclude: status !== "pending_review",
		canEditCases: true,
		locked: false,
	};
}

/** 结论分布计数，键与 `TestRunCaseResult` 一一对应。 */
export type ResultCounts = Record<TestRunCaseResult, number>;

export function emptyResultCounts(): ResultCounts {
	return { blocked: 0, failed: 0, passed: 0, skipped: 0, untested: 0 };
}

export function countResults(
	results: readonly TestRunCaseResult[]
): ResultCounts {
	const counts = emptyResultCounts();
	for (const result of results) {
		counts[result] += 1;
	}
	return counts;
}
