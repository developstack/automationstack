/**
 * 草稿在清单里怎么念：标题与时间。
 *
 * 单独一个文件是因为有**两处**清单要用同一套口径——侧栏的「未完成草稿」对话框
 * （workspace/case-drafts-dialog.tsx）和新建抽屉顶部的提示（case-draft-picker.tsx）。
 * 同一个模块现在可以有多份草稿，用户就是靠「名字 + 时间」这两样把它们分开的；
 * 两处各写一份文案，迟早会一边显示「未命名用例」另一边显示空白。
 */
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { formatDateTime } from "@/components/cases/case-meta";

/** 用例名可以是空的（草稿嘛），但清单里总得有个能点、能念的东西。 */
export const UNNAMED_CASE = "未命名用例";

/** savedAt 缺失（老版本或被改坏）时 parseCaseDraft 会回落成 0，别显示 1970 年。 */
export const UNKNOWN_TIME = "时间未知";

export function caseDraftTitle(draft: CaseDraft): string {
	const name = draft.values.name.trim();
	return name === "" ? UNNAMED_CASE : name;
}

export function caseDraftSavedLabel(draft: CaseDraft): string {
	return draft.savedAt === 0
		? UNKNOWN_TIME
		: formatDateTime(new Date(draft.savedAt));
}
