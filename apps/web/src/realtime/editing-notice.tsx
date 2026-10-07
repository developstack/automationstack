import { PencilLineIcon } from "lucide-react";

import { useCaseEditors } from "./use-editing";

const NAME_SEPARATOR = "、";

interface CaseEditingNoticeProps {
	caseId: string | undefined;
}

const NOTICE_CLASS =
	"flex items-center gap-2 border-amber-500/40 border-b bg-amber-500/10 px-4 py-2 text-amber-600 text-xs dark:text-amber-400";

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
