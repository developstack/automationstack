/**
 * 「正在编辑」软提示 UI：详情面板顶部的琥珀色提示条。
 * 只提示、不阻止编辑；并发保存由 `cases.update` 的乐观锁兜底。
 *
 * 列表行上曾经还有一枚同色小圆点，已随用例列表的「协作」列一并撤掉
 * （见 components/cases/case-collaborators-cell.tsx）：同一行里编码两次同一件事。
 */
import { PencilLineIcon } from "lucide-react";

import { useCaseEditors } from "./use-editing";

/** 多人同时编辑时的用户名连接符。 */
const NAME_SEPARATOR = "、";

interface CaseEditingNoticeProps {
	caseId: string | undefined;
}

const NOTICE_CLASS =
	"flex items-center gap-2 border-amber-500/40 border-b bg-amber-500/10 px-4 py-2 text-amber-600 text-xs dark:text-amber-400";

/**
 * 详情面板顶部的琥珀色提示条：「XX 正在编辑此用例」。
 * live region 常驻、只换文本：polite 区域与内容一起插入时多数读屏会漏掉
 * 第一次播报，而第一次恰恰是最要紧的那次。
 */
export function CaseEditingNotice({ caseId }: CaseEditingNoticeProps) {
	const editors = useCaseEditors(caseId);
	const active = editors.length > 0;
	return (
		<div className={active ? NOTICE_CLASS : "sr-only"} role="status">
			{active ? (
				<>
					<PencilLineIcon className="icon-stroke-regular size-3.5 shrink-0" />
					<span>{`${editors.join(NAME_SEPARATOR)} 正在编辑此用例，保存时可能发生冲突。`}</span>
				</>
			) : null}
		</div>
	);
}
