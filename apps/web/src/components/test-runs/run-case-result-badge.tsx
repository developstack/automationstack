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

import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

export function RunCaseResultBadge({ result }: { result: TestRunCaseResult }) {
	const Icon = RESULT_ICONS[result];
	return (
		// class 与分步汇总条那颗**逐字相同**，理由见文件头。
		<span
			className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-sm ${RESULT_BADGE_CLASSES[result]}`}
		>
			<Icon aria-hidden="true" className="size-4" />
			{RESULT_LABELS[result]}
		</span>
	);
}
