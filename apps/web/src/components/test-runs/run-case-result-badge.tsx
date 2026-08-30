/**
 * 结论徽章：一块色底 + 图标 + 中文，五态都画。
 *
 * 单独成文件本是因为它有两个使用点——用例名旁边、执行结论面板的折叠触发器——
 * 这两处必须**逐字长得一样**，抄两遍迟早漂移。后者已经删掉（折叠条上只剩标题，
 * 见 `run-case-verdict-panel.tsx` 头注释），现在活着的调用点只剩用例名旁边一处
 * （`run-case-heading.tsx`）；仍然单独成文件，是留给以后再有地方要用同一颗徽章时
 * 直接引用，而不是重新抄一份。
 *
 * 「未测」这一档也照画（灰底「未测」）：这是留给折叠触发器那处的画法，收起来的
 * 执行结论面板本靠它回答「这条到底判了没有」。触发器上的徽章删掉之后，这一档
 * 眼下没有调用方在用——名字旁边那处**不要**这块灰色块（整份清单每条都顶着一块
 * 无信息的色块），由调用方自己挡掉。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

/**
 * 结论图标切换的过渡参数：本文件与 run-step-card.tsx 的 StepResultBadge 共用
 * 同一份（那边直接 import 这个常量），两处是同一套「结论切换」视觉语言，必须
 * 逐字一致——导出成一份而不是各写一遍，才不会将来悄悄分叉。
 *
 * full 档数值是审计定死的：scale 0.25→1、opacity 0→1、blur 4px→0，spring
 * duration 0.3 且 bounce=0（收尾不回弹）。reduced 档照抄 page-transition.tsx
 * 里 useReducedMotion 的处理方式——去掉缩放与模糊，只留一次几乎察觉不到的
 * 透明度变化，动效敏感的用户不该看见图标做「缩到一点再放大」这种形变。
 * initial 与 exit 值相同：两者都是「未出现在屏幕上」的那个状态。
 */
export const ICON_MOTION = {
	full: {
		animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
		exit: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
		initial: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
		transition: { bounce: 0, duration: 0.3, type: "spring" },
	},
	reduced: {
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		initial: { opacity: 0 },
		transition: { duration: 0.12 },
	},
} as const;

export function RunCaseResultBadge({ result }: { result: TestRunCaseResult }) {
	const Icon = RESULT_ICONS[result];
	const v = ICON_MOTION[useReducedMotion() ? "reduced" : "full"];
	return (
		// class 与分步汇总条那颗**逐字相同**，理由见文件头。
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-sm ${RESULT_BADGE_CLASSES[result]}`}
		>
			{/* key=result 而不是硬切：这里一次只挂一枚徽章（对比 run-case-row.tsx
			    清单里的硬切图标——那边几百行同时挂载，批量通过会是闪烁风暴）。 */}
			<AnimatePresence initial={false} mode="wait">
				<motion.span key={result} {...v}>
					<Icon aria-hidden="true" className="size-4" />
				</motion.span>
			</AnimatePresence>
			{RESULT_LABELS[result]}
		</span>
	);
}
