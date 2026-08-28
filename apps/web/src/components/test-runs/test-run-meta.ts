/**
 * 测试任务执行台共用的展示元数据与权限推导（plan §2）。
 *
 * 刻意留在 apps/web 而不下沉到 packages/ui：`TestRunStatus` / `TestRunCaseResult`
 * 是业务枚举，通用组件不该认识它们——与 `components/cases/case-meta.ts` 同一档。
 */
import type {
	TestRunCaseResult,
	TestRunStatus,
	TestRunStepResult,
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

/**
 * 结论的**底色**版本，用在已保存、只读展示的地方（步骤卡片抬头、汇总条）。
 *
 * 与 `RESULT_TEXT_CLASSES` 并存而不是取代它：正在编辑时结论只是一行字的一部分，
 * 涂个字色就够；判定落库之后它是这张卡的结论，一行同色小字扫十张卡根本认不出来，
 * 得有一块能被眼睛先抓到的色块。两张表的色相严格一一对应，只差有没有底。
 *
 * 底色统一用 /15：本仓库 theme.css 的四个状态色在浅底上做 15% 混色后，
 * 与 card 底面的对比落在 1.1~1.2:1，是「看得出是一块」但不会盖过文字的档位；
 * 文字仍用实色（≥ 4.5:1），所以对比度不靠底色兑现，底色只负责定位。
 */
export const RESULT_BADGE_CLASSES: Record<TestRunCaseResult, string> = {
	blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	failed: "bg-destructive/15 text-destructive",
	passed: "bg-success/15 text-success",
	skipped: "bg-muted text-muted-foreground",
	untested: "bg-muted text-muted-foreground",
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
 * 分步判定的四态。值与 `VERDICT_VALUES` 逐字相同，类型却不是同一个：
 * 步骤没有「未测」这一档（没点过的保存时落成跳过），所以它的元素类型是
 * `TestRunStepResult`。共用 `VERDICT_VALUES` 会让每个使用点都要再断言一次，
 * 而断言正是这里最不该出现的东西——枚举将来若分家，断言不会报错。
 */
export const STEP_VERDICT_VALUES: readonly TestRunStepResult[] = [
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
 * 这条结论是否需要「说明 + 附件」那两块。
 *
 * 只有**失败**和**阻塞**需要：其余三态（通过 / 跳过 / 未测）打完就完事了，
 * 把空控件常驻在下面只会让人每判一条都要略过一遍。
 *
 * **缺陷不走这条规则**，它有自己的 `needsDefectLink`（多一档「跳过」）。
 * 两者分家不是重复：说明与附件是「解释这次为什么没通过」的产物，跳过一条
 * 用例往往没什么可写也没图可传；而缺陷是「挡住我的那个东西在哪」，跳过恰恰
 * 常常就是被一个已知缺陷挡的。合成一条规则，必然是让跳过多两个空控件、
 * 或者让它挂不上缺陷，两头都比多写一个函数贵。
 *
 * 注意这只是「相不相关」。**已经有内容的那块一律照常显示**，判断在各自的
 * 调用点上做（说明看 comment、附件看列表长度）：判过失败又改判通过时，
 * 说明 / 附件在库里都还在（后端只有回退成 `untested` 时才清 comment），
 * 藏起来等于让人以为数据没了。
 */
export function needsVerdictDetails(result: TestRunCaseResult): boolean {
	return result === "failed" || result === "blocked";
}

/**
 * 这条结论下「缺陷」那一块相不相关。
 *
 * 比 `needsVerdictDetails` 多一档**跳过**（用户原话：「只有失败阻塞跳过才显示，
 * 通过就不要显示了」）。为什么不是同一个函数、各自服务谁，见上面那段。
 *
 * 同样只是「相不相关」：**已经关联了缺陷的一律照常显示**，那条逃生口在
 * `RunCaseDefectSection` 里（只有它看得到 defectKey / defectUrl）——
 * 把一条挂着缺陷的用例改判通过就让缺陷从页面上消失，看着就是数据丢了，
 * 更糟的是底下还留着一个没人知道的未关闭缺陷。
 */
export function needsDefectLink(result: TestRunCaseResult): boolean {
	return needsVerdictDetails(result) || result === "skipped";
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
