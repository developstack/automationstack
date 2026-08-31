/**
 * 「这条用例最后是谁判的」——常驻在执行结论面板里的那一行小字。
 *
 * 从 `run-case-events.tsx` 拆出来（那个文件对外导出两个组件）。它是用例级答案的
 * 第一层，只回答最后一次；完整时间线是第二层，仍在 `run-case-events.tsx`。
 * 两层共用同一个「署名丢了」的兜底（`DELETED_ACTOR`），那份连同理由留在原处。
 */

import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { formatDateTime } from "@/components/cases/case-meta";
import { DELETED_ACTOR } from "@/components/test-runs/run-case-events";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";

export interface RunCaseLastVerdictProps {
	executedAt: Date | null;
	executedByName: string | null;
	result: TestRunCaseResult;
}

/**
 * 常驻的一行：最后一次是谁、几点、判成了什么。
 *
 * 刻意做成一行小字而不是卡片/边框块：这一页刚刚才把失败专属的三块
 * （说明 / 附件 / 缺陷）收起来过，再加一个有框的区块等于把杂乱又加回去。
 *
 * `untested` 一档整行不显示：后端回退成未测时会把 `executedAt` / `executedBy`
 * 一并清空（见 `buildResultPatch`），此时没有「最后一次判定」这回事——
 * 显示成「未知」是在暗示数据丢了，而实际上是这条用例现在确实没有判定。
 * `executedAt` 为 null 时同样整行不显示，理由相同（不该发生，但不猜）。
 */
export function RunCaseLastVerdict({
	executedAt,
	executedByName,
	result,
}: RunCaseLastVerdictProps) {
	if (result === "untested" || executedAt === null) {
		return null;
	}
	return (
		<p className={RUN_SECTION_TEXT}>
			{`最后由 ${executedByName ?? DELETED_ACTOR} 于 ${formatDateTime(executedAt)} 判定为 `}
			{/*
			 * 结论只加 font-medium，不加引号也不加颜色。
			 *
			 * 原先写的是「判为「通过」」：一句中文里再套一层引号，读的人要先分清
			 * 哪对引号是句子的、哪对是值的。去掉引号之后「判为通过」会黏成一团，
			 * 所以动词补成「判定为」——多一个字，断句就回来了。
			 *
			 * 颜色不给：这一行是灰色小字，通篇只有它变色会把视线从上面那颗真正的
			 * 结论徽章上抢走，而徽章才是这一屏读结论的地方（形状 + 底色 + 文字
			 * 三重编码，见 `test-run-meta.ts` 的 RESULT_ICONS）。
			 */}
			<span className="font-medium">{RESULT_LABELS[result]}</span>
		</p>
	);
}
